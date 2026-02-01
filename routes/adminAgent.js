// routes/adminAgent.js
const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");

// ✅ OLD pdf-parse (works like: pdfParse(buffer))
// Install: npm i pdf-parse@1.1.1
const pdfParse = require("pdf-parse");

const { ensureAuth, ensureAdmin } = require("../middleware");

// Admin-only gate
router.use(ensureAuth);
router.use(ensureAdmin);

// -----------------------------
// Helpers
// -----------------------------
function getBaseUrl(req) {
  // Prefer env if you deploy behind proxy/CDN
  // Example: PUBLIC_BASE_URL=https://www.petvoyage.ai
  const envBase = process.env.PUBLIC_BASE_URL;
  if (envBase && typeof envBase === "string" && envBase.startsWith("http")) {
    return envBase.replace(/\/+$/, "");
  }

  // Otherwise infer from request
  const proto =
    (req.headers["x-forwarded-proto"] || "").toString().split(",")[0].trim() ||
    req.protocol ||
    "http";

  const host =
    (req.headers["x-forwarded-host"] || "").toString().split(",")[0].trim() ||
    req.get("host");

  return `${proto}://${host}`.replace(/\/+$/, "");
}

function toAbsoluteUrl(req, maybeUrl) {
  const s = String(maybeUrl || "").trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return `${getBaseUrl(req)}${s}`;
  // If someone passed "uploads/..." without leading slash
  return `${getBaseUrl(req)}/${s.replace(/^\/+/, "")}`;
}

// Walk JSON and convert any "/uploads/agent-pdfs/..." URLs to absolute
function absolutizeUploadedPdfUrls(req, obj) {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    obj.forEach((v) => absolutizeUploadedPdfUrls(req, v));
    return;
  }

  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === "string") {
      if (v.startsWith("/uploads/agent-pdfs/")) obj[k] = toAbsoluteUrl(req, v);
    } else if (v && typeof v === "object") {
      absolutizeUploadedPdfUrls(req, v);
    }
  }
}

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

// -----------------------------
// PDF upload (public/uploads/agent-pdfs)
// -----------------------------
const uploadDir = path.join(process.cwd(), "public", "uploads", "agent-pdfs");
fs.mkdirSync(uploadDir, { recursive: true });

function getPublicBaseUrl(req) {
  // Prefer explicit base URL so you don't accidentally store localhost in prod
  const envBase = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (envBase) return envBase;

  // Fallback: build from request
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.get("host");
  return `${proto}://${host}`;
}

function safeFilename(original) {
  const safe = String(original || "file.pdf").replace(/[^\w.\-]+/g, "_");
  return `${Date.now()}_${safe}`;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => cb(null, safeFilename(file.originalname)),
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

// robust pdf-parse loader for CommonJS
function loadPdfParse() {
  let mod;
  try {
    mod = require("pdf-parse");
  } catch (e) {
    throw new Error(`pdf-parse is not installed. Run: npm i pdf-parse`);
  }

  let fn = mod;
  if (fn && typeof fn !== "function" && typeof fn.default === "function") fn = fn.default;

  // Some installs end up exporting a pdfjs bundle instead of the parse function.
  // Try the internal entry point as a fallback.
  if (typeof fn !== "function") {
    try {
      const internal = require("pdf-parse/lib/pdf-parse.js");
      if (typeof internal === "function") fn = internal;
      if (internal && typeof internal.default === "function") fn = internal.default;
    } catch {
      // ignore
    }
  }

  if (typeof fn !== "function") {
    const keys = mod ? Object.keys(mod) : [];
    throw new Error(
      "pdf-parse import did not return a function. " +
        "Fix by reinstalling a known-good version: npm i pdf-parse@1.1.1. " +
        "Export keys were: " + keys.join(", ")
    );
  }

  return fn;
}

// POST /admin/agent/upload-pdf
// FormData: pdf=<file>, countryName, (optional) auditId
router.post("/agent/upload-pdf", upload.single("pdf"), async (req, res) => {
  try {
    const countryName = String(req.body?.countryName || "").trim();
    const auditId = req.body?.auditId ? String(req.body.auditId).trim() : null;

    if (!countryName) return res.status(400).json({ ok: false, error: "countryName is required" });
    if (!req.file) return res.status(400).json({ ok: false, error: "No file uploaded (field name must be 'pdf')" });

    // Accept "application/octet-stream" as long as filename ends in .pdf
    const originalLower = String(req.file.originalname || "").toLowerCase();
    if (!originalLower.endsWith(".pdf")) {
      return res.status(400).json({ ok: false, error: "Only PDF files are supported" });
    }

    const baseUrl = getPublicBaseUrl(req);
    const publicPath = `/uploads/agent-pdfs/${req.file.filename}`;
    const publicUrl = `${baseUrl}${publicPath}`;

    const buf = fs.readFileSync(req.file.path);

    const pdfParse = loadPdfParse();
    const parsed = await pdfParse(buf);

    const extractedText = String(parsed?.text || "")
      .replace(/\u0000/g, "")
      .slice(0, 250000);

    const { withDb } = await import("../utils/regs-agent/db.mjs");

    const sourceId = await withDb(async ({ db }) => {
      const r = await db.collection("agent_uploaded_sources").insertOne({
        type: "pdf",
        countryName,
        auditId: auditId || null,

        filename: req.file.originalname,
        storedFilename: req.file.filename,
        publicUrl,
        publicPath,

        mimeType: req.file.mimetype,
        size: req.file.size,
        extractedText,
        createdAt: new Date(),
      });
      return r.insertedId.toString();
    });

    return res.json({ ok: true, sourceId, publicUrl, filename: req.file.originalname });
  } catch (e) {
    console.error("[agent/upload-pdf] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /admin/agent/pdfs?countryName=...&auditId=...
router.get("/agent/pdfs", async (req, res) => {
  try {
    const countryName = String(req.query?.countryName || "").trim();
    const auditId = req.query?.auditId ? String(req.query.auditId).trim() : null;

    if (!countryName) return res.status(400).json({ ok: false, error: "countryName is required" });

    const { withDb } = await import("../utils/regs-agent/db.mjs");

    const rows = await withDb(async ({ db }) => {
      const q = { countryName };
      if (auditId) q.auditId = auditId;

      return db
        .collection("agent_uploaded_sources")
        .find(q, { projection: { extractedText: 0 } })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray();
    });

    return res.json({
      ok: true,
      pdfs: (rows || []).map((r) => ({
        id: r._id?.toString?.(),
        filename: r.filename,
        publicUrl: r.publicUrl,
        createdAt: r.createdAt,
        auditId: r.auditId || null,
      })),
    });
  } catch (e) {
    console.error("[agent/pdfs] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});


// -----------------------------
// Audit fetch routes
// -----------------------------

// GET /admin/agent/audit/latest?countryName=...
router.get("/agent/audit/latest", async (req, res) => {
  try {
    const countryName = String(req.query.countryName || "").trim();
    if (!countryName) return res.status(400).json({ ok: false, error: "countryName is required" });

    const { withDb } = await import("../utils/regs-agent/db.mjs");
    const { getLatestAudit } = await import("../utils/regs-agent/audit.mjs");

    const audit = await withDb(async ({ db }) => getLatestAudit(db, countryName));
    if (!audit) return res.json({ ok: true, audit: null });

    return res.json({
      ok: true,
      audit: {
        id: audit._id?.toString?.(),
        ranAt: audit.ranAt,
        trace: audit.trace || {},
        draft: audit.draft || null,
        finalDoc: audit.finalDoc || null,
      },
    });
  } catch (e) {
    console.error("[agent/audit/latest] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /admin/agent/audit/:id
router.get("/agent/audit/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "id is required" });

    const { withDb } = await import("../utils/regs-agent/db.mjs");
    const { getAuditById } = await import("../utils/regs-agent/audit.mjs");

    const audit = await withDb(async ({ db }) => getAuditById(db, id));
    if (!audit) return res.status(404).json({ ok: false, error: "Audit not found" });

    return res.json({
      ok: true,
      audit: {
        id: audit._id?.toString?.(),
        ranAt: audit.ranAt,
        trace: audit.trace || {},
        draft: audit.draft || null,
        finalDoc: audit.finalDoc || null,
      },
    });
  } catch (e) {
    console.error("[agent/audit/:id] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// -----------------------------
// Preview route
// -----------------------------
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

// -----------------------------
// Chat route (PATCHES existing draft/finalDoc)
// - can use uploaded PDFs as context
// - returns finalDoc + new auditId
// -----------------------------
router.post("/agent/chat", async (req, res) => {
  try {
    const { countryName, message, auditId, finalDoc } = req.body || {};
    if (!countryName) return res.status(400).json({ ok: false, error: "countryName is required" });
    if (!message || !String(message).trim()) return res.status(400).json({ ok: false, error: "message is required" });

    const msg = String(message).trim();

    const { withDb } = await import("../utils/regs-agent/db.mjs");
    const { getAuditById, getLatestAudit, writeAudit } = await import("../utils/regs-agent/audit.mjs");
    const { normalizeDraftShape } = await import("../utils/regs-agent/utils/normalize.mjs");
    const { cleanDocUrls } = await import("../utils/regs-agent/utils/cleanUrls.mjs");
    const { mergeExistingLinks } = await import("../utils/regs-agent/utils/mergeLinks.mjs");
    const { hardValidate } = await import("../utils/regs-agent/agents/validator.mjs");
    const { openai } = await import("../utils/regs-agent/openaiClient.mjs");

    // Base doc priority:
    // 1) finalDoc passed from UI (latest in-memory)
    // 2) auditId doc
    // 3) latest audit doc
    let baseDraft = finalDoc || null;

    if (!baseDraft) {
      const audit = await withDb(async ({ db }) => {
        if (auditId) return await getAuditById(db, String(auditId));
        return await getLatestAudit(db, String(countryName));
      });

      if (!audit) return res.status(404).json({ ok: false, error: "No audit found to patch." });
      baseDraft = audit.finalDoc || audit.draft || null;
      if (!baseDraft) return res.status(400).json({ ok: false, error: "Audit has no draft/finalDoc to patch." });
    }

    // Load recent uploaded PDFs as context
    const pdfSources = await withDb(async ({ db }) => {
      const q = { countryName: String(countryName).trim() };
      const rows = await db
        .collection("agent_uploaded_sources")
        .find(q)
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray();
      return rows || [];
    });

    const pdfContext = pdfSources
      .map((s, i) => {
        const abs = s.publicUrlAbs || toAbsoluteUrl(req, s.publicPath || s.publicUrl);
        const text = String(s.extractedText || "").slice(0, 18000);
        return `PDF_SOURCE_${i + 1}
publicUrlAbs: ${abs}
filename: ${s.filename}
text:
${text}`;
      })
      .join("\n\n");

    const prompt = `
You are a JSON editor for PetVoyage country regulations.

Return ONLY the updated JSON (full document), valid JSON. No markdown.

Rules:
- Preserve existing structure.
- Only change what OPERATOR_MESSAGE asks.
- ALL URLs MUST BE ABSOLUTE (start with https://).
- Do not fabricate sources.
- You MAY add our uploaded PDF links (publicUrlAbs) into officialLinks or the relevant petType links if the PDF supports it.

Uploaded PDFs:
${pdfContext || "(none)"}

OPERATOR_MESSAGE:
${msg}

CURRENT_JSON:
${JSON.stringify(baseDraft).slice(0, 180000)}
`;

    const resp = await openai.responses.create({
      model: "gpt-5",
      input: prompt,
      text: { format: { type: "json_object" } },
    });

    const patchedDraft = JSON.parse(resp.output_text);

    // Normalize/clean/merge then force uploaded pdf urls absolute, then validate
    const plain = JSON.parse(JSON.stringify(patchedDraft));
    normalizeDraftShape(plain);
    cleanDocUrls(plain);
    mergeExistingLinks({ existing: baseDraft, draft: plain });

    // ✅ Critical: if model inserted "/uploads/agent-pdfs/.." anywhere, make it absolute
    absolutizeUploadedPdfUrls(req, plain);

    const validated = hardValidate(plain); // throws if invalid

    const newAuditId = await withDb(async ({ db }) =>
      writeAudit(db, {
        countryName,
        trace: {
          stage: "chat_patch",
          ranAt: new Date().toISOString(),
          patchedFromAuditId: auditId || null,
          pdfSourcesUsed: pdfSources.map((s) => s.publicUrlAbs || s.publicPath || s.publicUrl),
        },
        draft: plain,
        finalDoc: validated,
        publishResult: { dryRun: true },
      })
    );

    return res.json({
      ok: true,
      replyMarkdown: `✅ Applied patch and validated. New audit: **${newAuditId}**`,
      auditId: newAuditId,
      finalDoc: validated,
    });
  } catch (e) {
    console.error("[agent/chat] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// -----------------------------
// Notes route (optional)
// -----------------------------
router.get("/agent/notes", (req, res) => {
  const countryName = String(req.query.countryName || "").trim();
  if (!countryName) return res.json({ ok: true, notes: "" });
  return res.json({ ok: true, notes: getNotes(countryName) });
});

// -----------------------------
// SSE stream route (preview runs)
// -----------------------------
router.get("/agent/stream", async (req, res) => {
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

// -----------------------------
// Admin page + countries list
// -----------------------------
router.get("/agent", (req, res) => {
  res.render("admin/agent", { user: req.user });
});

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

// -----------------------------
// Run (non-stream) preview
// -----------------------------
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

// -----------------------------
// Publish
// - If UI sends finalDoc => publish DIRECTLY (no re-search)
// - Otherwise fallback to old behavior (rerun pipeline)
// -----------------------------
router.post("/agent/publish", async (req, res) => {
  try {
    const { countryName, finalDoc, auditId } = req.body || {};
    if (!countryName) return res.status(400).json({ ok: false, error: "countryName is required" });

    const { withDb } = await import("../utils/regs-agent/db.mjs");
    const { writeAudit } = await import("../utils/regs-agent/audit.mjs");
    const { normalizeDraftShape } = await import("../utils/regs-agent/utils/normalize.mjs");
    const { cleanDocUrls } = await import("../utils/regs-agent/utils/cleanUrls.mjs");
    const { hardValidate } = await import("../utils/regs-agent/agents/validator.mjs");
    const { publisherAgent } = await import("../utils/regs-agent/agents/publisher.mjs");

    // ✅ Publish what you already drafted (no research)
    if (finalDoc) {
      return await withDb(async ({ db, coll }) => {
        const plain = JSON.parse(JSON.stringify(finalDoc));

        normalizeDraftShape(plain);
        cleanDocUrls(plain);
        absolutizeUploadedPdfUrls(req, plain);

        const validated = hardValidate(plain);
        const publishResult = await publisherAgent({ coll, finalDoc: validated });

        const newAuditId = await writeAudit(db, {
          countryName,
          trace: {
            stage: "published_from_finalDoc",
            ranAt: new Date().toISOString(),
            publishedFromAuditId: auditId || null,
          },
          draft: plain,
          finalDoc: validated,
          publishResult,
        });

        return res.json({
          ok: true,
          stage: "published",
          auditId: newAuditId,
          publishResult,
          finalDoc: validated,
        });
      });
    }

    // Fallback: old behavior (rerun pipeline)
    const { runCountryAgent } = await import("../utils/regs-agent/agents/runCountryAgent.mjs");
    const operatorNotes = getNotes(String(countryName));

    const result = await runCountryAgent({
      countryName,
      dryRun: false,
      researchMode: req.body?.researchMode || "seed_first",
      manualUrls: String(req.body?.manualUrls || "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
      operatorNotes,
    });

    return res.json(result);
  } catch (e) {
    console.error("[agent/publish] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
