// routes/adminAgent.js
const express = require("express");
const router = express.Router();
const { ensureAuth, ensureAdmin } = require("../middleware");

// Admin-only gate
router.use(ensureAuth);
router.use(ensureAdmin);

/**
 * POST /admin/agent/preview
 * Returns rendered HTML preview for a finalDoc (used by iframe srcdoc)
 */
router.post("/agent/preview", async (req, res) => {
  try {
    const { finalDoc } = req.body;

    if (!finalDoc) return res.status(400).send("No document to preview");

    // Build the same locals your normal country page expects
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
 * GET /admin/agent/stream
 * SSE endpoint: streams progress + final JSON result
 */
router.get("/agent/stream", async (req, res) => {
  // SSE headers
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // If you're behind Nginx, this helps prevent buffering:
  res.setHeader("X-Accel-Buffering", "no");

  // Send headers now
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  let closed = false;

  // If client disconnects, stop writing
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

  // helper to send events
  const send = (type, data) => {
    // IMPORTANT: don't use event name "error" (conflicts with native EventSource error)
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

      // ✅ Stream detailed backend steps to the UI
      onProgress: (message) => {
        send("progress", { message, at: new Date().toISOString() });
      },
    });

    // Final result (JSON)
    send("done", result);
    return res.end();
  } catch (e) {
    console.error("[agent/stream] failed:", e);

    // Send a custom error event so the browser doesn't swallow it
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
