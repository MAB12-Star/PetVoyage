// routes/adminAgent.js
const express = require("express");
const router = express.Router();
const { ensureAuth, ensureAdmin } = require("../middleware");


// Admin-only gate
router.use(ensureAuth);
router.use(ensureAdmin);

// GET HTML preview of a dry-run result
router.post('/agent/preview', async (req, res) => {
  try {
    const { finalDoc } = req.body;

    if (!finalDoc) {
      return res.status(400).send('No document to preview');
    }

    // Build the same locals your normal country page expects
    return res.render('regulations/showCountry', {
      regulations: finalDoc,
      regulationId: finalDoc._id || null,
      petTypes: Object.keys(finalDoc.regulationsByPetType || {}).map(k => ({
        key: k,
        slug: k.toLowerCase()
      })),
      selectedPetType: Object.keys(finalDoc.regulationsByPetType || {})[0] || null,
      originReqs: [],
      user: req.user
    });
  } catch (e) {
    console.error(e);
    res.status(500).send('Preview failed');
  }
});

// SSE: stream progress
router.get("/agent/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // helper to send events
  const send = (type, data) => {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { countryName, researchMode, wantExplain, manualUrls, dryRun } = req.query;

    const urls = String(manualUrls || "")
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);

    const { runCountryAgent } = await import("../utils/regs-agent/agents/runCountryAgent.mjs");

    send("status", { message: "Starting…" });

    const result = await runCountryAgent({
      countryName,
      dryRun: String(dryRun || "true") === "true",
      wantExplain: String(wantExplain || "false") === "true",
      researchMode: researchMode || "seed_first",
      manualUrls: urls,
      onProgress: (message) => send("progress", { message, at: new Date().toISOString() })
    });

    send("done", result);
    res.end();
  } catch (e) {
    send("error", { message: e.message });
    res.end();
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
    // Use the agent’s own DB connector so we don’t duplicate Mongo config
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
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /admin/agent/run
 * Runs the pipeline in DRY RUN (preview)
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
      manualUrls: urls
    });

    return res.json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /admin/agent/publish
 * Runs the pipeline and PUBLISHES to Mongo
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
      manualUrls: urls
    });

    return res.json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
