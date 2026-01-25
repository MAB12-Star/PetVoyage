// routes/adminAgent.js
const express = require("express");
const router = express.Router();
const { ensureAuth, ensureAdmin } = require("../middleware");

// Admin-only gate
router.use(ensureAuth);
router.use(ensureAdmin);

/**
 * POST /admin/agent/preview
 */
router.post("/preview", async (req, res) => {
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
 * GET /admin/agent/stream  (SSE)
 */
router.get("/stream", async (req, res) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  if (typeof res.flushHeaders === "function") res.flushHeaders();

  let closed = false;
  req.on("close", () => { closed = true; });

  const safeWrite = (chunk) => {
    if (closed || res.writableEnded || res.destroyed) return false;
    try { res.write(chunk); return true; } catch { return false; }
  };

  const send = (type, data) => {
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

    send("status", { message: `Starting agent for ${countryName}` });

    const result = await runCountryAgent({
      countryName,
      dryRun: String(dryRun ?? "true") === "true",
      wantExplain: String(wantExplain ?? "false") === "true",
      researchMode: researchMode || "seed_first",
      manualUrls: urls,
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
 */
router.get("/", (req, res) => {
  res.render("admin/agent", { user: req.user });
});

/**
 * GET /admin/agent/countries
 */
router.get("/countries", async (req, res) => {
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
 * POST /admin/agent/run   (preview / dryRun)
 */
router.post("/run", async (req, res) => {
  try {
    const { countryName, researchMode, manualUrls, wantExplain } = req.body;

    const urls = String(manualUrls || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    const { runCountryAgent } = await import("../utils/regs-agent/agents/runCountryAgent.mjs");

    const result = await runCountryAgent({
      countryName,
      dryRun: true,
      wantExplain: String(wantExplain || "false") === "true",
      researchMode: researchMode || "seed_first",
      manualUrls: urls,
    });

    return res.json(result);
  } catch (e) {
    console.error("[agent/run] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /admin/agent/publish
 */
router.post("/publish", async (req, res) => {
  try {
    const { countryName, researchMode, manualUrls } = req.body;

    const urls = String(manualUrls || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    const { runCountryAgent } = await import("../utils/regs-agent/agents/runCountryAgent.mjs");

    const result = await runCountryAgent({
      countryName,
      dryRun: false,
      researchMode: researchMode || "seed_first",
      manualUrls: urls,
    });

    return res.json(result);
  } catch (e) {
    console.error("[agent/publish] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
