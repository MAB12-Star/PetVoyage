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

function hasText(s) {
  return typeof s === "string" && s.trim().length > 0;
}

// Build a "fake" research payload for extractor to use when refining an existing doc.
// This avoids web_search/researcher entirely while still letting the extractor do the AI rewrite.
function makeRefinePayload({ airlineCode, baseDoc, operatorNotes }) {
  return {
    ok: true,
    stage: "refine_from_doc",
    airlineCode,
    // extractorAgent can treat this as its "report"/context blob
    report: [
      "REFINE MODE (no web research).",
      "BASE_DOC_JSON:",
      JSON.stringify(baseDoc, null, 2),
      "",
      "OPERATOR_NOTES:",
      operatorNotes || "",
    ].join("\n"),
    sources: [], // keep consistent shape if extractor expects it
  };
}

async function withTimeout(promise, ms, label = "timeout") {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
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

    // ------------------------------------------------------------
    // A) Fast-path: reuse audit doc for preview/resume
    //    If operatorNotes exist, we will refine it (instead of returning it directly).
    // ------------------------------------------------------------
    let reusedAuditMeta = null;

    if (dryRun && reuseAudit && !inputDoc) {
      const cached = await readLatestAudit({ airlineCode });
      const cachedDoc =
        cached?.finalDoc ||
        cached?.draft ||
        cached?.finalDoc?.draft ||
        null;

      if (cached?.found && cachedDoc && typeof cachedDoc === "object") {
        reusedAuditMeta = { auditPath: cached.auditPath };
        inputDoc = cachedDoc;

        if (!hasText(operatorNotes)) {
          onProgress(`2) Reusing latest audit payload (${cached.auditPath})...`);
          return {
            ok: true,
            stage: "reused_audit",
            airlineCode,
            auditPath: cached.auditPath,
            finalDoc: cachedDoc,
          };
        }

        onProgress(`2) Reusing latest audit payload (${cached.auditPath})...`);
        onProgress(`3) Applying chat refine notes (no re-research)...`);
        // Continue into "inputDoc refine" path below
      }
    }

    // ------------------------------------------------------------
    // B) Fast-path: inputDoc provided (preview/publish-from-preview/chat)
    //    - If operatorNotes exist: refine via extractorAgent using synthetic payload
    //    - Else: validate as-is
    // ------------------------------------------------------------
    if (inputDoc && typeof inputDoc === "object") {
      let draft = inputDoc;

      // If notes exist, run refine through extractor (no researcher)
      if (hasText(operatorNotes)) {
        onProgress("2) Using provided document + operator notes (skip research)...");
        onProgress("3) Extractor (refine-only)...");
        const refinePayload = makeRefinePayload({ airlineCode, baseDoc: inputDoc, operatorNotes });

        draft = await extractorAgent({
          airlineCode,
          researchPayload: refinePayload,
          existingAirline: existing,
          operatorNotes,
        });
      } else {
        onProgress("2) Using provided document (skip research/extract)...");
      }

      onProgress("4) Validating...");
      let finalDoc;
      let explain = null;

      try {
        finalDoc = hardValidate(draft, { airlineCode });
      } catch (e) {
        if (wantExplain) explain = await validatorAgentExplain({ draftDoc: draft });

        const auditPath = await writeAudit({
          airlineCode,
          dryRun,
          researchPayload: {
            ok: true,
            stage: hasText(operatorNotes) ? "refine_from_doc" : "provided_doc",
            reusedAudit: reusedAuditMeta?.auditPath || null,
          },
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

      const auditPath = await writeAudit({
        airlineCode,
        dryRun,
        researchPayload: {
          ok: true,
          stage: hasText(operatorNotes) ? "refine_from_doc" : "provided_doc",
          reusedAudit: reusedAuditMeta?.auditPath || null,
        },
        finalDoc,
      });

      if (dryRun) {
        return { ok: true, stage: "dry_run", airlineCode, auditPath, finalDoc };
      }

      onProgress("5) Publishing...");
      // Publisher should never hang forever
      const publishResult = await withTimeout(
        publisherAgent({ coll, existingAirline: existing, finalDoc }),
        90_000,
        "publisher timeout"
      );

      return { ok: true, stage: "published", airlineCode, auditPath, publishResult, finalDoc };
    }

    // ------------------------------------------------------------
    // C) Full pipeline: researcher -> extractor -> validate -> (publish)
    // ------------------------------------------------------------
    onProgress(`2) Researcher (${researchMode})...`);
    const research = await researcherAgent({
      airlineCode,
      existingAirline: existing,
      manualUrls,
      researchMode,
      operatorNotes,
      onProgress,
    });

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
      if (wantExplain) explain = await validatorAgentExplain({ draftDoc: draft });

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
    const publishResult = await withTimeout(
      publisherAgent({ coll, existingAirline: existing, finalDoc }),
      90_000,
      "publisher timeout"
    );

    return { ok: true, stage: "published", airlineCode, auditPath, publishResult, finalDoc };
  });
}
