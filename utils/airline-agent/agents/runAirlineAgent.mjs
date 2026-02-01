



import { withDb, getAirlineByCode } from "../db.mjs";
import { writeAudit, readLatestAudit } from "../audit.mjs";
import { writeOutputJson } from "../utils/writeOutput.mjs";

import { researcherAgent } from "./researcher.mjs";
import { extractorAgent } from "./extractor.mjs";
import { hardValidate, validatorAgentExplain } from "./validator.mjs";
import { publisherAgent } from "./publisher.mjs";

function splitUrls(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  return String(input)
    .split(/\r?\n/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function runAirlineAgent({
  airlineCode,
  dryRun = true,
  researchMode = "seed_first",
  manualUrls = [],
  operatorNotes = "",
  wantExplain = false,
  reuseAudit = true,
  inputDoc = null,
  onProgress = () => {},
}) {
  airlineCode = String(airlineCode || "").trim().toUpperCase();
  if (!airlineCode) throw new Error("airlineCode is required.");

  manualUrls = splitUrls(manualUrls);

  return await withDb(async ({ coll }) => {
    onProgress(`1) Fetching existing airline doc for ${airlineCode}...`);
    const existing = await getAirlineByCode(coll, airlineCode);
    if (!existing) throw new Error(`No airline found for airlineCode=${airlineCode}`);


    // 1b) If caller provided a document (e.g., from preview/audit), skip research/extract and just validate/publish.
    if (inputDoc && typeof inputDoc === "object") {
      onProgress("2) Using provided document (skip research/extract)...");
      let finalDoc;
      let explain = null;
      try {
        finalDoc = hardValidate(inputDoc, { airlineCode });
      } catch (e) {
        if (wantExplain) explain = await validatorAgentExplain({ draftDoc: inputDoc });
        const auditPath = await writeAudit({ airlineCode, dryRun, researchPayload: { ok:true, stage:"provided_doc" }, finalDoc: { error: e.message, draft: inputDoc } });
        return { ok:false, stage:"validation_failed", airlineCode, auditPath, error: e.message, explain, draft: inputDoc };
      }
      const auditPath = await writeAudit({ airlineCode, dryRun, researchPayload: { ok:true, stage:"provided_doc" }, finalDoc });
      if (dryRun) return { ok:true, stage:"dry_run", airlineCode, auditPath, finalDoc };
      onProgress("3) Publishing...");
      const publishResult = await publisherAgent({ coll, existingAirline: existing, finalDoc });
      return { ok:true, stage:"published", airlineCode, auditPath, publishResult, finalDoc };
    }

    // 1c) Optional: reuse latest audit for fast preview (avoid re-running researcher/extractor when troubleshooting).
    if (dryRun && reuseAudit) {
      const cached = await readLatestAudit({ airlineCode });
      if (cached?.found && (cached.finalDoc || cached.draft || cached.finalDoc?.draft)) {
        const cachedDoc = cached.finalDoc || cached.draft || cached.finalDoc?.draft || null;
        if (cachedDoc && typeof cachedDoc === "object") {
          onProgress(`2) Reusing latest audit payload (${cached.auditPath})...`);
          return { ok:true, stage:"reused_audit", airlineCode, auditPath: cached.auditPath, finalDoc: cachedDoc };
        }
      }
    }

    onProgress(`2) Researcher (${researchMode})...`);
    const research = await researcherAgent({
      airlineCode,
      existingAirline: existing,
      manualUrls,
      researchMode,
      operatorNotes,
      onProgress,
    });

    // If research failed, return diagnostics cleanly (don’t “fill in from DB”)
    if (research?.ok === false && research?.stage === "research_failed") {
      const auditPath = await writeAudit({ airlineCode, dryRun, researchPayload: research, finalDoc: null });
      return { ok: false, stage: "research_failed", airlineCode, auditPath, ...research };
    }

    onProgress("3) Extractor: build airline JSON...");
    const draft = await extractorAgent({
      airlineCode,
      researchPayload: research,
      existingAirline: existing,
      operatorNotes,
    });

    onProgress("4) Validating...");
    let finalDoc;
    let explain = null;

    try {
      finalDoc = hardValidate(draft, { airlineCode });
    } catch (e) {
      if (wantExplain) {
        explain = await validatorAgentExplain({ draftDoc: draft });
      }
      const auditPath = await writeAudit({
        airlineCode,
        dryRun,
        researchPayload: research,
        finalDoc: { error: e.message, draft },
      });
      return {
        ok: false,
        stage: "validation_failed",
        airlineCode,
        auditPath,
        error: e.message,
        explain,
        draft,
      };
    }

    const auditPath = await writeAudit({ airlineCode, dryRun, researchPayload: research, finalDoc });

    if (dryRun) {
      onProgress("5) Dry run: writing output file...");
      const savedTo = await writeOutputJson({ airlineCode, data: finalDoc });
      return { ok: true, stage: "dry_run", airlineCode, auditPath, savedTo, finalDoc };
    }

    onProgress("5) Publishing...");
    const publishResult = await publisherAgent({ coll, existingAirline: existing, finalDoc });
    return { ok: true, stage: "published", airlineCode, auditPath, publishResult, finalDoc };
  });
}



