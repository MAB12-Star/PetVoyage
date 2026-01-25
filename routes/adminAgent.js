// routes/adminAgent.js
const express = require("express");
const router = express.Router();
const { ensureAuth, ensureAdmin } = require("../middleware");

// Admin-only gate
router.use(ensureAuth);
router.use(ensureAdmin);

/**
 * Helpers
 */
function toLines(text = "") {
  return String(text)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function slugify(s = "") {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * GET /admin/agent
 * Renders the admin UI page
 */
router.get("/agent", (req, res) => {
  return res.render("admin/agent", { user: req.user });
});

/**
 * GET /admin/agent/stream
 * SSE DISABLED (intentionally). The UI should use POST /admin/agent/run instead.
 */
router.get("/agent/stream", (req, res) => {
  return res.status(410).json({
    ok: false,
    error: "SSE stream disabled. Use POST /admin/agent/run instead.",
  });
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
    return res.status(500).json({ ok: false, error: e?.message || "Failed to load countries" });
  }
});

/**
 * POST /admin/agent/run
 * Runs pipeline in DRY RUN (preview)
 */
router.post("/agent/run", async (req, res) => {
  try {
    const { countryName, researchMode, manualUrls, wantExplain } = req.body || {};

    if (!countryName || !String(countryName).trim()) {
      return res.status(400).json({ ok: false, error: "countryName is required" });
    }

    const mode = researchMode || "seed_first";
    const urls = toLines(manualUrls);

    if (mode === "provided_only" && urls.length === 0) {
      return res.status(400).json({ ok: false, error: "provided_only mode requires manualUrls" });
    }

    const { runCountryAgent } = await import("../utils/regs-agent/agents/runCountryAgent.mjs");

    const result = await runCountryAgent({
      countryName: String(countryName).trim(),
      dryRun: true,
      wantExplain: String(wantExplain ?? "false") === "true" || wantExplain === true,
      researchMode: mode,
      manualUrls: urls,
    });

    return res.json(result);
  } catch (e) {
    console.error("[agent/run] failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Run failed" });
  }
});

/**
 * POST /admin/agent/publish
 * Runs pipeline and publishes to Mongo
 */
router.post("/agent/publish", async (req, res) => {
  try {
    const { countryName, researchMode, manualUrls, wantExplain } = req.body || {};

    if (!countryName || !String(countryName).trim()) {
      return res.status(400).json({ ok: false, error: "countryName is required" });
    }

    const mode = researchMode || "seed_first";
    const urls = toLines(manualUrls);

    if (mode === "provided_only" && urls.length === 0) {
      return res.status(400).json({ ok: false, error: "provided_only mode requires manualUrls" });
    }

    const { runCountryAgent } = await import("../utils/regs-agent/agents/runCountryAgent.mjs");

    const result = await runCountryAgent({
      countryName: String(countryName).trim(),
      dryRun: false,
      // allow wantExplain on publish too (optional)
      wantExplain: String(wantExplain ?? "false") === "true" || wantExplain === true,
      researchMode: mode,
      manualUrls: urls,
    });

    return res.json(result);
  } catch (e) {
    console.error("[agent/publish] failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Publish failed" });
  }
});

/**
 * POST /admin/agent/preview
 * Returns rendered HTML preview for a finalDoc (used by iframe srcdoc)
 */
router.post("/agent/preview", async (req, res) => {
  try {
    const { finalDoc } = req.body || {};
    if (!finalDoc) return res.status(400).send("No document to preview");

    const petTypeKeys = Object.keys(finalDoc.regulationsByPetType || {});
    const petTypes = petTypeKeys.map((k) => ({
      key: k,
      slug: slugify(k),
    }));

    return res.render("regulations/showCountry", {
      regulations: finalDoc,
      regulationId: finalDoc._id || null,
      petTypes,
      selectedPetType: petTypeKeys[0] || null,
      originReqs: [],
      user: req.user,
    });
  } catch (e) {
    console.error("[agent/preview] failed:", e);
    return res.status(500).send("Preview failed");
  }
});

module.exports = router;
