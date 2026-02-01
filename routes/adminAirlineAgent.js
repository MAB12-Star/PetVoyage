const express = require("express");
const router = express.Router();

// ❌ DO NOT require() .mjs from CommonJS
// const { runAirlineAgent } = require("../utils/airline-agent/agents/runAirlineAgent.mjs");
// const { withDb, listAirlines } = require("../utils/airline-agent/db.mjs");

// --------------------------------------------
// ESM loaders (CommonJS-safe)
// --------------------------------------------
let _runAirlineAgent = null;
async function runAirlineAgent(args) {
  if (!_runAirlineAgent) {
    const mod = await import("../utils/airline-agent/agents/runAirlineAgent.mjs");
    // Supports either: export function runAirlineAgent() {} OR export default ...
    _runAirlineAgent = mod.runAirlineAgent || mod.default;
    if (!_runAirlineAgent) {
      throw new Error("runAirlineAgent export not found in runAirlineAgent.mjs");
    }
  }
  return _runAirlineAgent(args);
}

let _withDb = null;
let _listAirlines = null;
async function getDbFns() {
  if (_withDb && _listAirlines) return { withDb: _withDb, listAirlines: _listAirlines };

  const mod = await import("../utils/airline-agent/db.mjs");
  _withDb = mod.withDb || (mod.default && mod.default.withDb);
  _listAirlines = mod.listAirlines || (mod.default && mod.default.listAirlines);

  if (!_withDb || !_listAirlines) {
    throw new Error("withDb/listAirlines export not found in db.mjs");
  }
  return { withDb: _withDb, listAirlines: _listAirlines };
}

// --------------------------------------------
// Helpers
// --------------------------------------------
function parseUrls(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  return String(input)
    .split(/\r?\n/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

// --------------------------------------------
// Page: Airline Agent UI
// --------------------------------------------
router.get("/airline-agent", (req, res) => {
  res.render("admin/airlineAgent", { page: "airline-agent" });
});

// ✅ NEW: Airline dropdown data
router.get("/airline-agent/airlines", async (req, res) => {
  try {
    const { withDb, listAirlines } = await getDbFns();
    const airlines = await withDb(async ({ coll }) => {
      return await listAirlines(coll);
    });
    res.json({ ok: true, airlines });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// --------------------------------------------
// Latest Audit (for fast preview / resume)
// --------------------------------------------
router.get("/airline-agent/latest-audit", async (req, res) => {
  const airlineCode = String(req.query.airlineCode || "")
    .trim()
    .toUpperCase();
  if (!airlineCode)
    return res.json({
      ok: false,
      stage: "bad_request",
      error: "airlineCode is required",
    });

  try {
    const mod = await import("../utils/airline-agent/audit.mjs");
    const out = await mod.readLatestAudit({ airlineCode });
    if (!out.found) return res.json({ ok: true, found: false });

    // prefer a usable document for preview
    const doc = out.finalDoc || out.draft || out.finalDoc?.draft || null;
    return res.json({
      ok: true,
      found: true,
      airlineCode,
      auditPath: out.auditPath,
      finalDoc: doc,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      stage: "exception",
      error: err.message || String(err),
    });
  }
});

// ✅ NEW: Preview iframe HTML renderer
router.post("/airline-agent/preview", (req, res) => {
  const { finalDoc } = req.body || {};
  if (!finalDoc) return res.status(400).send("<p>Missing finalDoc</p>");

  // Simple HTML preview (you can style this later)
  const html = `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <style>
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 16px; }
        .card { border: 1px solid #e5e5e5; border-radius: 10px; padding: 14px; }
        h2 { margin: 0 0 8px; }
        .muted { color: #666; font-size: 14px; }
        ul { margin: 6px 0 0 18px; }
        code { background: #f6f6f6; padding: 2px 6px; border-radius: 6px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>${finalDoc.airlineCode || "Airline"} Pet Policy</h2>
        <div class="muted">
          petPolicyURL: <a href="${finalDoc.petPolicyURL || "#"}" target="_blank" rel="noopener">${finalDoc.petPolicyURL || "(none)"}</a>
        </div>
        <hr/>
        ${finalDoc.ImprovedPetPolicySummary || `<p>${finalDoc.PetPolicySummary || "(no summary yet)"}</p>`}
        <hr/>
        <p><b>In cabin:</b> ${finalDoc.inCompartment}</p>
        <p><b>In cargo:</b> ${finalDoc.inCargo}</p>
        <p><b>Service animals:</b> ${finalDoc.serviceAnimals}</p>
        <p><b>ESAs:</b> ${finalDoc.esAnimals}</p>
      </div>

      <pre style="margin-top:12px; white-space:pre-wrap;">${escapeHtml(
        JSON.stringify(finalDoc, null, 2)
      )}</pre>

      <script>
        function escapeHtml(s){return s.replace(/[&<>"']/g,(c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]))}
      </script>
    </body>
  </html>
  `;
  res.type("html").send(html);
});

router.get("/airline-agent/stream", async (req, res) => {
  const {
    airlineCode,
    researchMode = "seed_first",
    manualUrls = "",
    operatorNotes = "",
    wantExplain = "0",
  } = req.query;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let closed = false;

  const safeSend = (event, data) => {
    if (closed) return;
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      closed = true;
    }
  };

  const ping = setInterval(() => {
    safeSend("progress", { message: "…" });
  }, 15000);

  req.on("close", () => {
    closed = true;
    clearInterval(ping);
  });

  try {
    const result = await runAirlineAgent({
      airlineCode,
      dryRun: true,
      researchMode,
      manualUrls: parseUrls(manualUrls),
      operatorNotes,
      wantExplain: wantExplain === "1",
      onProgress: (msg) => safeSend("progress", { message: msg }),
    });

    clearInterval(ping);

    if (result?.ok === false && result.stage === "research_failed") {
      safeSend("failed", { ...result, terminal: true });
      return res.end();
    }

    if (result?.ok === false) {
      // ✅ DO NOT use event name "error"
      safeSend("agent_error", { ...result, terminal: true });
      return res.end();
    }

    safeSend("done", { ...result, terminal: true });
    return res.end();
  } catch (err) {
    clearInterval(ping);

    console.error("❌ SSE /airline-agent/stream crashed:", err);
    console.error(err?.stack || "(no stack)");

    // ✅ DO NOT use event name "error"
    safeSend("agent_error", {
      ok: false,
      stage: "exception",
      error: err?.message || String(err),
    });

    return res.end();
  }
});

router.post("/airline-agent/chat", async (req, res) => {
  const {
    airlineCode,
    operatorNotes = "",
    researchMode = "seed_first",
    manualUrls = [],
    baseDoc = null
  } = req.body;

  console.log("[CHAT] hit", { airlineCode, hasBaseDoc: !!baseDoc, notesLen: operatorNotes.length });

  // HARD TIMEOUT so it can’t hang forever
  const TIMEOUT_MS = 90_000;

  try {
    const result = await Promise.race([
      (async () => {
        console.log("[CHAT] calling runAirlineAgent...");
        const out = await runAirlineAgent({
          airlineCode,
          dryRun: true,
          researchMode,
          manualUrls: parseUrls(manualUrls),
          operatorNotes,
          inputDoc: baseDoc || undefined,
          reuseAudit: false,
        });
        console.log("[CHAT] runAirlineAgent returned", { ok: out?.ok, stage: out?.stage });
        return out;
      })(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`CHAT_TIMEOUT after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
      ),
    ]);

    if (!result?.ok) return res.json(result);
    return res.json({ ok: true, stage: "preview_updated", finalDoc: result.finalDoc });
  } catch (err) {
    console.error("[CHAT] error:", err?.stack || err);
    return res.status(500).json({ ok: false, stage: "exception", error: err.message || String(err) });
  }
});


// --------------------------------------------
// Publish
// --------------------------------------------
router.post("/airline-agent/publish", async (req, res) => {
  const { airlineCode, researchMode = "seed_first", manualUrls = [], operatorNotes = "" } =
    req.body;

  try {
    const result = await runAirlineAgent({
      airlineCode,
      dryRun: false,
      researchMode,
      manualUrls: parseUrls(manualUrls),
      operatorNotes,
    });

    res.json(result);
  } catch (err) {
    res
      .status(500)
      .json({ ok: false, stage: "exception", error: err.message || String(err) });
  }
});

// --------------------------------------------
// Publish from Preview (no re-research)
// --------------------------------------------
router.post("/airline-agent/publish-from-preview", async (req, res) => {
  const { airlineCode, finalDoc } = req.body || {};
  try {
    const result = await runAirlineAgent({
      airlineCode,
      dryRun: false,
      inputDoc: finalDoc,
      // NOTE: no reuseAudit here — we explicitly publish the provided doc
      reuseAudit: false,
    });
    return res.json(result);
  } catch (err) {
    return res
      .status(500)
      .json({ ok: false, stage: "exception", error: err.message || String(err) });
  }
});

module.exports = router;

// helper for preview HTML
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[c])
  );
}
