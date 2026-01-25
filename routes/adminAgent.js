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
function splitManualUrls(input) {
  return String(input || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * GET /admin/agent
 * Renders the admin agent UI
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
 * POST /admin/agent/run   (preview / dryRun)
 * Non-SSE run (still can 504 in prod if Nginx timeouts are low)
 */
router.post("/agent/run", async (req, res) => {
  try {
    const { countryName, researchMode, manualUrls, wantExplain } = req.body;

    if (!countryName) {
      return res.status(400).json({ ok: false, error: "countryName is required" });
    }

    const urls = splitManualUrls(manualUrls);

    const { runCountryAgent } = await import("../utils/regs-agent/agents/runCountryAgent.mjs");

    const result = await runCountryAgent({
      countryName,
      dryRun: true,
      wantExplain: Boolean(wantExplain),
      researchMode: researchMode || "seed_first",
      manualUrls: urls,
      echoLogs: false
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
router.post("/agent/publish", async (req, res) => {
  try {
    const { countryName, researchMode, manualUrls, wantExplain } = req.body;

    if (!countryName) {
      return res.status(400).json({ ok: false, error: "countryName is required" });
    }

    const urls = splitManualUrls(manualUrls);

    const { runCountryAgent } = await import("../utils/regs-agent/agents/runCountryAgent.mjs");

    const result = await runCountryAgent({
      countryName,
      dryRun: false,
      wantExplain: Boolean(wantExplain),
      researchMode: researchMode || "seed_first",
      manualUrls: urls,
      echoLogs: false
    });

    return res.json(result);
  } catch (e) {
    console.error("[agent/publish] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

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
 * GET /admin/agent/stream  (SSE)
 * This is what you want in production to avoid timeouts:
 * - keepalive ping every ~10s
 * - correct headers
 * - safe writes
 */
router.get("/agent/stream", async (req, res) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // nginx: do not buffer SSE

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

  // Keepalive ping so Nginx doesn’t think the upstream is idle
  const ping = setInterval(() => {
    // SSE comment line is valid + lightweight
    safeWrite(`: ping ${Date.now()}\n\n`);
  }, 10000);

  try {
    const { countryName, researchMode, wantExplain, manualUrls, dryRun } = req.query;

    if (!countryName) {
      send("agent_error", { message: "countryName is required." });
      clearInterval(ping);
      return res.end();
    }

    const urls = splitManualUrls(manualUrls);

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
    clearInterval(ping);
    return res.end();
  } catch (e) {
    console.error("[agent/stream] failed:", e);
    send("agent_error", { message: e?.message || "Unknown stream error" });
    clearInterval(ping);
    return res.end();
  }
});

/**
 * POST /admin/agent/chat
 * Lets you “talk to the agent” after a run to find gaps + get better sources.
 * Returns: reply + suggestedUrls + suggestedSearchTerms
 */
router.post("/agent/chat", async (req, res) => {
  try {
    const { countryName, message, finalDoc, manualUrls, researchMode } = req.body || {};

    if (!message) {
      return res.status(400).json({ ok: false, error: "message is required" });
    }

    // Lazy import the OpenAI client you already have in the agent utilities
    const { openai } = await import("../utils/regs-agent/openaiClient.mjs");

    const prompt = {
      role: "system",
      content:
        "You are the PetVoyage Regulations Agent assistant. " +
        "Your job: help the admin improve accuracy. " +
        "Given: (1) countryName, (2) current draft JSON (finalDoc) if present, (3) manual URLs, (4) researchMode, and (5) admin message. " +
        "Return STRICT JSON with keys: replyMarkdown (string), missingOrUnclear (array of strings), suggestedUrls (array of strings), suggestedSearchTerms (array of strings), and nextInstructions (string). " +
        "If a URL is not official government or primary authority, do NOT suggest it."
    };

    const userPayload = {
      countryName: countryName || null,
      researchMode: researchMode || null,
      manualUrls: splitManualUrls(manualUrls),
      finalDoc: finalDoc || null,
      adminMessage: message
    };

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_AGENT_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        prompt,
        { role: "user", content: JSON.stringify(userPayload) }
      ],
      response_format: { type: "json_object" }
    });

    const raw = completion?.choices?.[0]?.message?.content || "{}";
    const data = safeJsonParse(raw, { replyMarkdown: raw });

    return res.json({
      ok: true,
      replyMarkdown: data.replyMarkdown || "",
      missingOrUnclear: Array.isArray(data.missingOrUnclear) ? data.missingOrUnclear : [],
      suggestedUrls: Array.isArray(data.suggestedUrls) ? data.suggestedUrls : [],
      suggestedSearchTerms: Array.isArray(data.suggestedSearchTerms) ? data.suggestedSearchTerms : [],
      nextInstructions: data.nextInstructions || ""
    });
  } catch (e) {
    console.error("[agent/chat] failed:", e);
    return res.status(500).json({ ok: false, error: e.message || "chat failed" });
  }
});

module.exports = router;
