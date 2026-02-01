// agent/runCountryAgent.mjs
import { withDb, getCountryDocByName } from "../db.mjs";
import { writeAudit } from "../audit.mjs";

import { researcherAgent } from "./researcher.mjs";
import { extractorAgent } from "./extractor.mjs";
import { hardValidate, validatorAgentExplain } from "./validator.mjs";
import { publisherAgent } from "./publisher.mjs";

import { normalizeDraftShape } from "../utils/normalize.mjs";
import { cleanDocUrls } from "../utils/cleanUrls.mjs";
import { extractHostsFromExisting } from "../utils/extractAllowedHosts.mjs";
import { mergeExistingLinks } from "../utils/mergeLinks.mjs";

// --- URL preflight helpers (fail fast) ---
function isAbsUrl(u) {
  try { new URL(u); return true; } catch { return false; }
}

async function headOrGet(url, timeoutMs = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  // Prefer HEAD, fallback to GET (some gov sites block HEAD)
  const tryFetch = async (method) => {
    const r = await fetch(url, { method, redirect: "follow", signal: ctrl.signal });
    return { ok: r.ok, status: r.status, finalUrl: r.url };
  };

  try {
    try {
      return await tryFetch("HEAD");
    } catch {
      return await tryFetch("GET");
    }
  } finally {
    clearTimeout(t);
  }
}

async function preflightUrls(urls, { checkReachable = true } = {}) {
  const cleaned = (urls || []).map(s => String(s).trim()).filter(Boolean);
  const invalidFormat = cleaned.filter(u => !isAbsUrl(u));

  const results = [];
  if (checkReachable) {
    // small concurrency limit
    const limit = 6;
    let i = 0;

    const workers = Array.from({ length: Math.min(limit, cleaned.length) }, async () => {
      while (i < cleaned.length) {
        const url = cleaned[i++];
        if (!isAbsUrl(url)) continue;
        try {
          const r = await headOrGet(url);
          results.push({ url, ...r });
        } catch (e) {
          results.push({ url, ok: false, status: 0, error: e?.message || "fetch failed" });
        }
      }
    });

    await Promise.all(workers);
  }

  const unreachable = results.filter(r => r.ok === false);

  return { cleaned, invalidFormat, results, unreachable };
}

function findInvalidDraftUrls(doc) {
  const bad = [];

  const check = (path, url) => {
    if (!url || !isAbsUrl(url)) bad.push({ path, url });
  };

  (doc?.officialLinks || []).forEach((l, i) => check(["officialLinks", i, "url"], l?.url));

  Object.entries(doc?.regulationsByPetType || {}).forEach(([petType, details]) => {
    (details?.links || []).forEach((l, i) =>
      check(["regulationsByPetType", petType, "links", i, "url"], l?.url)
    );
  });

  return bad;
}

function countKeys(obj) {
  return obj && typeof obj === "object" ? Object.keys(obj).length : 0;
}

function researchHasSources(research) {
  const officialLinksCount = Array.isArray(research?.officialLinks) ? research.officialLinks.length : 0;
  const childLinksCount = Array.isArray(research?.childLinks) ? research.childLinks.length : 0;
  return officialLinksCount + childLinksCount > 0;
}

function hasMeaningfulContent(doc) {
  const petCount = countKeys(doc?.regulationsByPetType);
  const officialLinksCount = Array.isArray(doc?.officialLinks) ? doc.officialLinks.length : 0;
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

export async function runCountryAgent({
  countryName,
  dryRun = true,
  wantExplain = false,
  requireResearchSources = true,
  requireMeaningfulExtract = true,
  allowPublishWithoutSources = false,
  researchMode = "seed_first", // "provided_only" | "seed_first" | "deep"
  manualUrls = [],
  operatorNotes = "",          // ✅ NEW: operator feedback injected into pipeline
  onProgress = () => {}        // ✅ progress callback
}) {
  if (!countryName) throw new Error("countryName is required.");

  onProgress(`Starting agent for ${countryName}`);

  return await withDb(async ({ db, coll }) => {
    // 1) Existing
    onProgress(`1) Fetching existing doc for ${countryName}...`);
    const existing = await getCountryDocByName(coll, countryName);
    const existingAllowedHosts = extractHostsFromExisting(existing);
    const seedUrls = collectSeedUrls(existing);

    // 1.5) Preflight manual URLs (fail fast)
if (researchMode === "provided_only" || (manualUrls && manualUrls.length)) {
  onProgress("1.5) Preflight: checking manual URLs...");

  const pf = await preflightUrls(manualUrls, { checkReachable: true });

  if (pf.invalidFormat.length || pf.unreachable.length) {
    const auditId = await writeAudit(db, {
      countryName,
      trace: {
        stage: "preflight_failed",
        ranAt: new Date().toISOString(),
        invalidFormat: pf.invalidFormat,
        unreachable: pf.unreachable
      },
      draft: null,
      finalDoc: null,
      publishResult: null
    });

    return {
      ok: false,
      stage: "preflight_failed",
      auditId,
      error: "Preflight failed: one or more input URLs are invalid or unreachable.",
      invalidFormat: pf.invalidFormat,
      unreachable: pf.unreachable
    };
  }
}

    // 2) Research
    onProgress(`2) Researcher: web_search (${researchMode})...`);
    let research = null;

    try {
      research = await researcherAgent({
        countryName,
        existingJson: existing,
        seedUrls,
        manualUrls,
        researchMode,
        operatorNotes // ✅ pass through
      });

      onProgress("2b) Researcher: convert report → JSON...");
    } catch (e) {
      await writeAudit(db, {
        countryName,
        trace: { stage: "research_failed", error: e.message, ranAt: new Date().toISOString() },
        draft: null,
        finalDoc: null,
        publishResult: null
      });
      throw e;
    }

    if (requireResearchSources && !allowPublishWithoutSources && !researchHasSources(research)) {
      const auditId = await writeAudit(db, {
        countryName,
        trace: { stage: "research_no_sources", error: "Research returned no sources.", ranAt: new Date().toISOString() },
        draft: null,
        finalDoc: null,
        publishResult: null
      });
      return { ok: false, stage: "research_no_sources", auditId, message: "Research returned no sources." };
    }

    // 3) Extract
    onProgress("3) Extractor: build schema JSON...");
    const draft = await extractorAgent({
      countryName,
      researchPayload: research,
      existingJson: existing,
      operatorNotes // ✅ give extractor the operator corrections too
    });

    const plainDraft = JSON.parse(JSON.stringify(draft));
    normalizeDraftShape(plainDraft);
    cleanDocUrls(plainDraft);
    mergeExistingLinks({ existing, draft: plainDraft });

    if (requireMeaningfulExtract && !hasMeaningfulContent(plainDraft)) {
      const auditId = await writeAudit(db, {
        countryName,
        trace: { stage: "extract_empty", error: "Extractor produced empty content.", ranAt: new Date().toISOString() },
        draft: plainDraft,
        finalDoc: null,
        publishResult: null
      });
      return { ok: false, stage: "extract_empty", auditId, message: "Extractor produced empty content." };
    }

    // 3.5) Draft URL scan (fail fast before schema validate / explain)
onProgress("3.5) Pre-validate: scanning draft URLs...");
const badUrls = findInvalidDraftUrls(plainDraft);

if (badUrls.length) {
  const auditId = await writeAudit(db, {
    countryName,
    trace: {
      stage: "draft_invalid_urls",
      ranAt: new Date().toISOString(),
      badUrls
    },
    draft: plainDraft,
    finalDoc: null,
    publishResult: null
  });

  return {
    ok: false,
    stage: "validation_failed",
    auditId,
    error: `Invalid url(s) found in draft: ${badUrls.length}`,
    badUrls,
    draft: plainDraft
  };
}


    // 4) Validate
    onProgress("4) Validating...");
    let finalDoc;

    try {
      finalDoc = hardValidate(plainDraft);
    } catch (e) {
      let explain = null;

      if (wantExplain) {
        try {
          explain = await validatorAgentExplain({
            draftDoc: plainDraft,
            operatorNotes // ✅ helps explain step use the same context
          });
        } catch (explainErr) {
          explain = { ok: false, issues: [`Explain failed: ${explainErr.message}`] };
        }
      }

      const auditId = await writeAudit(db, {
        countryName,
        trace: {
          stage: "validation_failed",
          error: e.message,
          explain,
          ranAt: new Date().toISOString(),
          sources: research?.officialLinks || [],
          childLinks: research?.childLinks || [],
          operatorNotes: String(operatorNotes || "").slice(0, 4000)
        },
        draft: plainDraft,
        finalDoc: null,
        publishResult: null
      });

      return { ok: false, stage: "validation_failed", auditId, error: e.message, explain, draft: plainDraft };
    }

    // 5) Dry run / Publish
    const trace = {
      countryName,
      ranAt: new Date().toISOString(),
      sources: research?.officialLinks || [],
      childLinks: research?.childLinks || [],
      sourceDates: research?.sourceDates || [],
      notes: research?.notes || [],
      researchMode,
      operatorNotes: String(operatorNotes || "").slice(0, 4000)
    };

    onProgress(dryRun ? "5) Dry run (no publish)..." : "5) Publishing...");

    if (dryRun) {
      const auditId = await writeAudit(db, {
        countryName,
        trace: { ...trace, stage: "dry_run" },
        draft: plainDraft,
        finalDoc,
        publishResult: { dryRun: true }
      });

      return { ok: true, stage: "dry_run", auditId, finalDoc, draft: plainDraft };
    }

    const publishResult = await publisherAgent({ coll, finalDoc });

    const auditId = await writeAudit(db, {
      countryName,
      trace: { ...trace, stage: "published" },
      draft: plainDraft,
      finalDoc,
      publishResult
    });

    return { ok: true, stage: "published", auditId, publishResult, finalDoc };
  });
}
