// utils/regsAgent/runAgent.mjs
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

/**
 * Run the full pipeline for a country.
 *
 * @param {object} params
 * @param {string} params.countryName
 * @param {boolean} [params.dryRun=true] - If true, do NOT write to Mongo (preview mode)
 * @param {boolean} [params.wantExplain=false] - If true, attempt validator explain JSON on failure
 * @param {boolean} [params.requireResearchSources=true]
 * @param {boolean} [params.requireMeaningfulExtract=true]
 * @param {boolean} [params.allowPublishWithoutSources=false]
 * @param {boolean} [params.echoLogs=false] - If true, also console.log in addition to capturing logs
 */
export async function runCountryRegulationsAgent({
  countryName,
  dryRun = true,
  wantExplain = false,
  requireResearchSources = true,
  requireMeaningfulExtract = true,
  allowPublishWithoutSources = false,
  echoLogs = false
} = {}) {
  if (!countryName || typeof countryName !== "string") {
    const err = new Error('countryName is required (e.g. "Antigua and Barbuda")');
    err.code = 400;
    throw err;
  }

  const logs = [];
  const log = (...args) => {
    const msg = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    logs.push(msg);
    if (echoLogs) console.log(...args);
  };
  const warn = (...args) => {
    const msg = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    logs.push(`WARN: ${msg}`);
    if (echoLogs) console.warn(...args);
  };
  const fail = (code, message) => {
    const err = new Error(message);
    err.code = code;
    throw err;
  };

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
    return petCount > 0 || officialLinksCount > 0;
  }

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

  // Run inside your existing db helper
  return await withDb(async ({ db, coll }) => {
    log(`=== Country Regulations Agent: ${countryName} ===`);
    log(`dryRun=${dryRun}`);

    // 1) Fetch existing doc
    log("1) Fetching existing doc...");
    const existing = await getCountryDocByName(coll, countryName);

    // Note: this currently isn’t used by hardValidate in your validator.mjs,
    // but we keep it for future tightening / trust logic.
    const existingAllowedHosts = extractHostsFromExisting(existing);

    const seedUrls = collectSeedUrls(existing);
    log(`   • Found ${seedUrls.length} seed URLs from DB`);

    // 2) Research
    log("2) Researching sources...");
    let research = null;

    try {
      research = await researcherAgent({
        countryName,
        existingJson: existing,
        seedUrls,
        preferSeeds: true
      });
    } catch (e1) {
      warn("Research attempt 1 failed:", e1.message);
      warn("Retrying research once...");

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

        fail(10, "Research failed twice. Not publishing. Existing doc preserved.");
      }
    }

    if (
      requireResearchSources &&
      !allowPublishWithoutSources &&
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

      fail(11, "Research returned no sources. Not publishing. Existing doc preserved.");
    }

    // 3) Extract
    log("3) Extracting schema JSON...");
    const draft = await extractorAgent({
      countryName,
      researchPayload: research,
      existingJson: existing
    });

    const plainDraft = JSON.parse(JSON.stringify(draft));
    normalizeDraftShape(plainDraft);
    cleanDocUrls(plainDraft);
    mergeExistingLinks({ existing, draft: plainDraft });

    if (requireMeaningfulExtract && !hasMeaningfulContent(plainDraft)) {
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

      fail(12, "Extractor produced empty content. Not publishing. Existing doc preserved.");
    }

    // 4) Validate
    log("4) Validating...");
    let finalDoc = null;
    let explain = null;

    try {
      // NOTE: your current hardValidate(doc) ignores extraAllowedHosts. :contentReference[oaicite:1]{index=1}
      // We keep existingAllowedHosts around for future upgrades if you want.
      finalDoc = hardValidate(plainDraft);
    } catch (e) {
      if (wantExplain) {
        try {
          explain = await validatorAgentExplain({ draftDoc: plainDraft });
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

      const err = new Error(`Hard validation failed: ${e.message}`);
      err.code = 2;
      err.explain = explain;
      throw err;
    }

    // 5) Dry run / Publish
    const trace = {
      countryName,
      ranAt: new Date().toISOString(),
      sources: research?.officialLinks || [],
      childLinks: research?.childLinks || [],
      sourceDates: research?.sourceDates || [],
      notes: research?.notes || []
    };

    if (dryRun) {
      await writeAudit(db, {
        countryName,
        trace: { ...trace, stage: "dry_run" },
        draft: plainDraft,
        finalDoc,
        publishResult: { dryRun: true }
      });

      log("DRY_RUN=true — not writing to MongoDB.");
      return {
        ok: true,
        mode: "dry_run",
        existing,
        research,
        draft: plainDraft,
        finalDoc,
        publishResult: { dryRun: true },
        trace,
        logs,
        existingAllowedHosts: [...existingAllowedHosts]
      };
    }

    log("5) Publishing...");
    const publishResult = await publisherAgent({ coll, finalDoc });

    await writeAudit(db, {
      countryName,
      trace: { ...trace, stage: "published" },
      draft: plainDraft,
      finalDoc,
      publishResult
    });

    log("Published successfully.");
    return {
      ok: true,
      mode: "published",
      existing,
      research,
      draft: plainDraft,
      finalDoc,
      publishResult,
      trace,
      logs,
      existingAllowedHosts: [...existingAllowedHosts]
    };
  });
}
