// routes/adminAgent.js
const express = require("express");
const router = express.Router();
const { ensureAuth, ensureAdmin } = require("../middleware");

// Admin-only gate
router.use(ensureAuth);
router.use(ensureAdmin);

// In-memory notes store (per country). You can persist to Mongo later.
const operatorNotesByCountry = new Map();

function getNotes(countryName) {
  return operatorNotesByCountry.get(countryName) || "";
}
function appendNote(countryName, line) {
  const prev = getNotes(countryName);
  const next = prev ? `${prev}\n${line}` : line;
  operatorNotesByCountry.set(countryName, next);
  return next;
}

/**
 * POST /admin/agent/preview
 * Returns rendered HTML preview for a finalDoc (used by iframe srcdoc)
 */
router.post("/agent/preview", async (req, res) => {
  try {
    const { finalDoc } = req.body;
    if (!finalDoc) return res.status(400).send("No document to preview");

    return res.render("regulations/showCountry", {
      regulations: finalDoc,
      regulationId: finalDoc._id || null,
      petTypes: Object.keys(finalDoc.regulationsByPetType || {}).map((k) => ({
        key: k,
        slug: String(k).toLowerCase(),
      })),
      selectedPetType: Object.keys(finalDoc.regulationsByPetType || {})[0] || null,
      originReqs: [],
      user: req.user,
    });
  } catch (e) {
    console.error("[agent/preview] failed:", e);
    return res.status(500).send("Preview failed");
  }
});

/**
 * POST /admin/agent/chat
 * Body: { countryName, message }
 * Stores operator feedback as notes that get injected into the next run.
 */
router.post("/agent/chat", async (req, res) => {
  try {
    const { countryName, message } = req.body || {};
    if (!countryName) return res.status(400).json({ ok: false, error: "countryName is required" });
    if (!message || !String(message).trim()) {
      return res.status(400).json({ ok: false, error: "message is required" });
    }

    const line = `- ${String(message).trim()}`;
    const notes = appendNote(countryName, line);

    return res.json({
      ok: true,
      replyMarkdown:
        `Saved. I’ll treat this as operator correction for **${countryName}** on the next run.\n\n` +
        `**Current operator notes:**\n${notes}`,
      notes,
      suggestedUrls: [],
      missingOrUnclear: [],
      suggestedSearchTerms: [],
      nextInstructions: "Click **Run (Preview)** again so the agent re-researches and updates the JSON using these corrections."
    });
  } catch (e) {
    console.error("[agent/chat] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /admin/agent/notes?countryName=...
 * Useful for debugging / showing saved notes.
 */
router.get("/agent/notes", (req, res) => {
  const countryName = String(req.query.countryName || "").trim();
  if (!countryName) return res.json({ ok: true, notes: "" });
  return res.json({ ok: true, notes: getNotes(countryName) });
});

/**
 * GET /admin/agent/stream
 * SSE endpoint: streams progress + final JSON result
 */
router.get("/agent/stream", async (req, res) => {
  // SSE headers
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // nginx: don't buffer SSE

  if (typeof res.flushHeaders === "function") res.flushHeaders();

  let closed = false;
  req.on("close", () => {
    closed = true;
  });

  const safeWrite = (chunk) => {
    if (closed || res.writableEnded || res.destroyed) return false;
    try {
      res.write(chunk);
      return true;
    } catch {
      return false;
    }
  };

  const send = (type, data) => {
    // DO NOT use event name "error" with EventSource
    safeWrite(`event: ${type}\n`);
    safeWrite(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { countryName, researchMode, wantExplain, manualUrls, dryRun } = req.query;

    if (!countryName) {
      send("agent_error", { message: "countryName is required." });
      return res.end();
    }

    const urls = String(manualUrls || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    const { runCountryAgent } = await import("../utils/regs-agent/agents/runCountryAgent.mjs");

    const operatorNotes = getNotes(String(countryName));

    send("status", { message: `Starting agent for ${countryName}` });

    const result = await runCountryAgent({
      countryName: String(countryName),
      dryRun: String(dryRun ?? "true") === "true",
      wantExplain: String(wantExplain ?? "false") === "true",
      researchMode: researchMode || "seed_first",
      manualUrls: urls,
      operatorNotes,
      onProgress: (message) => send("progress", { message, at: new Date().toISOString() }),
    });

    send("done", result);
    return res.end();
  } catch (e) {
    console.error("[agent/stream] failed:", e);
    send("agent_error", { message: e?.message || "Unknown stream error" });
    return res.end();
  }
});

/**
 * GET /admin/agent
 * Renders the admin UI page
 */
router.get("/agent", (req, res) => {
  res.render("admin/agent", { user: req.user });
});

/**
 * GET /admin/agent/countries
 * Returns list of destinationCountry values from Mongo
 */
router.get("/agent/countries", async (req, res) => {
  try {
    const { withDb } = await import("../utils/regs-agent/db.mjs");

    const countries = await withDb(async ({ coll }) => {
      const list = await coll.distinct("destinationCountry");
      return (list || [])
        .map((s) => String(s).trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    });

    return res.json({ ok: true, countries });
  } catch (e) {
    console.error("[agent/countries] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /admin/agent/run
 * Runs pipeline in DRY RUN (preview)
 */
router.post("/agent/run", async (req, res) => {
  try {
    const { countryName, researchMode, manualUrls, wantExplain } = req.body;

    const urls = String(manualUrls || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    const { runCountryAgent } = await import("../utils/regs-agent/agents/runCountryAgent.mjs");

    const operatorNotes = getNotes(String(countryName));

    const result = await runCountryAgent({
      countryName,
      dryRun: true,
      wantExplain: String(wantExplain || "false") === "true",
      researchMode: researchMode || "seed_first",
      manualUrls: urls,
      operatorNotes,
    });

    return res.json(result);
  } catch (e) {
    console.error("[agent/run] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /admin/agent/publish
 * Runs pipeline and publishes to Mongo
 */
router.post("/agent/publish", async (req, res) => {
  try {
    const { countryName, researchMode, manualUrls } = req.body;

    const urls = String(manualUrls || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    const { runCountryAgent } = await import("../utils/regs-agent/agents/runCountryAgent.mjs");

    const operatorNotes = getNotes(String(countryName));

    const result = await runCountryAgent({
      countryName,
      dryRun: false,
      researchMode: researchMode || "seed_first",
      manualUrls: urls,
      operatorNotes,
    });

    return res.json(result);
  } catch (e) {
    console.error("[agent/publish] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
