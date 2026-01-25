// index.mjs
import "dotenv/config";
import { withDb, getCountryDocByName } from "./db.mjs";
import { researcherAgent } from "./agents/researcher.mjs";
import { extractorAgent } from "./agents/extractor.mjs";
import { hardValidate, validatorAgentExplain } from "./agents/validator.mjs";
import { publisherAgent } from "./agents/publisher.mjs";
import { writeAudit } from "./audit.mjs";
import { normalizeDraftShape } from "./utils/normalize.mjs";
import { cleanDocUrls } from "./utils/cleanUrls.mjs";
import { extractHostsFromExisting } from "./utils/extractAllowedHosts.mjs";
import { mergeExistingLinks } from "./utils/mergeLinks.mjs";


const countryName = process.argv[2];
if (!countryName) {
  console.error('Usage: node index.mjs "Antigua and Barbuda"');
  process.exit(1);
}

const DRY_RUN = (process.env.DRY_RUN || "true").toLowerCase() === "true";
const WANT_EXPLAIN =
  (process.env.VALIDATOR_EXPLAIN || "false").toLowerCase() === "true";

// Safety: never publish if research produced no usable sources (prevents wiping pages)
const REQUIRE_RESEARCH_SOURCES =
  (process.env.REQUIRE_RESEARCH_SOURCES || "true").toLowerCase() === "true";

// Safety: never publish if extractor output is empty-ish (prevents wiping pages)
const REQUIRE_MEANINGFUL_EXTRACT =
  (process.env.REQUIRE_MEANINGFUL_EXTRACT || "true").toLowerCase() === "true";

// Optional override: allow publishing if there are zero sources (NOT recommended)
const ALLOW_PUBLISH_WITHOUT_SOURCES =
  (process.env.ALLOW_PUBLISH_WITHOUT_SOURCES || "false").toLowerCase() === "true";

function countKeys(obj) {
  return obj && typeof obj === "object" ? Object.keys(obj).length : 0;
}

function researchHasSources(research) {
  const officialLinksCount = Array.isArray(research?.officialLinks)
    ? research.officialLinks.length
    : 0;
  const childLinksCount = Array.isArray(research?.childLinks)
    ? research.childLinks.length
    : 0;
  return officialLinksCount + childLinksCount > 0;
}

function hasMeaningfulContent(doc) {
  const petCount = countKeys(doc?.regulationsByPetType);
  const officialLinksCount = Array.isArray(doc?.officialLinks)
    ? doc.officialLinks.length
    : 0;

  // Minimal “meaningful” bar: at least one pet type OR at least one official link.
  // Tighten if you want: return petCount > 0 && officialLinksCount > 0;
  return petCount > 0 || officialLinksCount > 0;
}

/**
 * Seed URLs from MongoDB so the researcher can start with known gov sources
 * instead of relying on web_search.
 */
function collectSeedUrls(existing) {
  const seeds = new Set();
  if (!existing) return [];

  (existing.officialLinks || []).forEach((l) => {
    if (l?.url) seeds.add(String(l.url).trim());
  });

  Object.values(existing.regulationsByPetType || {}).forEach((pet) => {
    (pet?.links || []).forEach((l) => {
      if (l?.url) seeds.add(String(l.url).trim());
    });
  });

  return [...seeds];
}

await withDb(async ({ db, coll }) => {
  console.log(`\n=== Country Regulations Agent: ${countryName} ===`);
  console.log(`DRY_RUN=${DRY_RUN}\n`);

  // --------------------------------------------------
  // 1) Fetch existing doc
  // --------------------------------------------------
  console.log("1) Fetching existing doc...");
  const existing = await getCountryDocByName(coll, countryName);

  // Hosts already present in DB are trusted (prevents policy blocks on previously-approved domains)
  const existingAllowedHosts = extractHostsFromExisting(existing);

  // Seed URLs already present in DB (lets researcher avoid web_search if possible)
  const seedUrls = collectSeedUrls(existing);
  console.log(`   • Found ${seedUrls.length} seed URLs from DB`);

  // --------------------------------------------
  // 2) Research (NO fallback that allows publish)
  // --------------------------------------------
  console.log("2) Researching sources...");
  let research = null;

  try {
    research = await researcherAgent({
      countryName,
      existingJson: existing,
      seedUrls,
      preferSeeds: true
    });
  } catch (e1) {
    console.warn("⚠️ Research attempt 1 failed:", e1.message);
    console.warn("🔁 Retrying research once...");

    try {
      research = await researcherAgent({
        countryName,
        existingJson: existing,
        seedUrls,
        preferSeeds: true
      });
    } catch (e2) {
      await writeAudit(db, {
        countryName,
        trace: {
          stage: "research_failed",
          error: e2.message,
          ranAt: new Date().toISOString()
        },
        draft: null,
        finalDoc: null,
        publishResult: null
      });

      console.error("❌ Research failed twice. Not publishing. Existing doc preserved.");
      process.exit(10);
    }
  }

  // If research returns but has zero sources, stop (unless explicitly allowed)
  if (
    REQUIRE_RESEARCH_SOURCES &&
    !ALLOW_PUBLISH_WITHOUT_SOURCES &&
    !researchHasSources(research)
  ) {
    await writeAudit(db, {
      countryName,
      trace: {
        stage: "research_no_sources",
        error: "Research completed but returned no official/child links.",
        ranAt: new Date().toISOString()
      },
      draft: null,
      finalDoc: null,
      publishResult: null
    });

    console.error("❌ Research returned no sources. Not publishing. Existing doc preserved.");
    process.exit(11);
  }

  // --------------------------------------------
  // 3) Extract
  // --------------------------------------------
  console.log("3) Extracting schema JSON...");
  const draft = await extractorAgent({
    countryName,
    researchPayload: research,
    existingJson: existing
  });

  const plainDraft = JSON.parse(JSON.stringify(draft));
  normalizeDraftShape(plainDraft);
  cleanDocUrls(plainDraft);
  mergeExistingLinks({ existing, draft: plainDraft });


  console.log(
    "Sample regulationsByPetType constructors:",
    Object.entries(plainDraft.regulationsByPetType || {})
      .slice(0, 3)
      .map(([k, v]) => [k, v?.constructor?.name])
  );

  // ✅ If extraction yielded nothing meaningful, STOP (don’t wipe your page)
  if (REQUIRE_MEANINGFUL_EXTRACT && !hasMeaningfulContent(plainDraft)) {
    await writeAudit(db, {
      countryName,
      trace: {
        stage: "extract_empty",
        error:
          "Extractor produced empty/meaningless doc; refusing to publish to avoid wiping existing content.",
        ranAt: new Date().toISOString(),
        sources: research?.officialLinks || [],
        childLinks: research?.childLinks || []
      },
      draft: plainDraft,
      finalDoc: null,
      publishResult: null
    });

    console.error("❌ Extractor produced empty content. Not publishing. Existing doc preserved.");
    process.exit(12);
  }

  // --------------------------------------------
  // 4) Validate (with existing host trust)
  // --------------------------------------------
  console.log("4) Validating...");
  let finalDoc;

  try {
    finalDoc = hardValidate(plainDraft, {
      extraAllowedHosts: existingAllowedHosts
    });
  } catch (e) {
    let explain = null;

    if (WANT_EXPLAIN) {
      try {
        explain = await validatorAgentExplain({
          draftDoc: plainDraft,
          extraAllowedHosts: existingAllowedHosts
        });
      } catch (explainErr) {
        explain = { ok: false, issues: [`Explain failed: ${explainErr.message}`] };
      }
    }

    await writeAudit(db, {
      countryName,
      trace: {
        stage: "validation_failed",
        error: e.message,
        explain,
        ranAt: new Date().toISOString(),
        sources: research?.officialLinks || [],
        childLinks: research?.childLinks || []
      },
      draft: plainDraft,
      finalDoc: null,
      publishResult: null
    });

    console.error("❌ Hard validation failed:", e.message);
    if (explain) console.error("Validator explain:", explain);
    process.exit(2);
  }

  // --------------------------------------------
  // 5) Dry run / Publish
  // --------------------------------------------
  const trace = {
    countryName,
    ranAt: new Date().toISOString(),
    sources: research?.officialLinks || [],
    childLinks: research?.childLinks || [],
    sourceDates: research?.sourceDates || [],
    notes: research?.notes || []
  };

  if (DRY_RUN) {
    await writeAudit(db, {
      countryName,
      trace: { ...trace, stage: "dry_run" },
      draft: plainDraft,
      finalDoc,
      publishResult: { dryRun: true }
    });

    console.log("\n🧪 DRY_RUN=true — not writing to MongoDB.\n");
    console.log(JSON.stringify(finalDoc, null, 2));
    return;
  }

  console.log("5) Publishing...");
  const result = await publisherAgent({ coll, finalDoc });

  await writeAudit(db, {
    countryName,
    trace: { ...trace, stage: "published" },
    draft: plainDraft,
    finalDoc,
    publishResult: result
  });

  console.log("✅ Published successfully:", result);
});
