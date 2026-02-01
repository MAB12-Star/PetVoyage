// utils/normalize.mjs
import { PetRegulationDetailSchema } from "../schema.mjs";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isPlainObject(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function toObjectMaybeMapOrEntries(x) {
  // Convert Map -> plain object
  if (x && typeof x === "object" && typeof x.entries === "function") {
    return Object.fromEntries([...x.entries()]);
  }
  // Convert [["k","v"], ...] -> object
  if (Array.isArray(x) && x.every((e) => Array.isArray(e) && e.length === 2)) {
    return Object.fromEntries(x);
  }
  // Already an object
  if (isPlainObject(x)) return x;

  // Anything else -> empty object
  return {};
}

function petDetailFromText(text) {
  const base = PetRegulationDetailSchema.parse({}); // fills defaults
  base.moreInfo = {
    General: {
      description: `<p>${escapeHtml(text)}</p>`,
      requirements: []
    }
  };
  return base;
}

function normalizePetDetail(v) {
  // If it's a primitive / null / array / weird thing => coerce
  if (!isPlainObject(v)) return petDetailFromText(v ?? "Not specified.");

  // If it's an object but missing structure, ensure structure exists
  if (!isPlainObject(v.vaccinations)) v.vaccinations = {};
  if (!isPlainObject(v.certifications)) v.certifications = {};
  if (!isPlainObject(v.moreInfo)) v.moreInfo = {};
  if (!Array.isArray(v.links)) v.links = [];
  if (typeof v.microchip !== "string") v.microchip = "<p>Not specified.</p>";

  // Finally, run through schema to apply defaults / enforce shape
  try {
    return PetRegulationDetailSchema.parse(v);
  } catch {
    // If parse fails for any reason, fall back to safe default
    return PetRegulationDetailSchema.parse({});
  }
}

function normalizeOriginReq(v) {
  if (!isPlainObject(v)) {
    return { appliesTo: [], details: String(v ?? "Not specified.") };
  }
  if (!Array.isArray(v.appliesTo)) v.appliesTo = [];
  if (typeof v.details !== "string") v.details = String(v.details ?? "Not specified.");
  return v;
}

export function normalizeDraftShape(draft) {
  // Normalize regulationsByPetType container
  const regsObj = toObjectMaybeMapOrEntries(draft?.regulationsByPetType);
  const normalizedRegs = {};

  for (const [k, v] of Object.entries(regsObj)) {
    normalizedRegs[k] = normalizePetDetail(v);
  }
  draft.regulationsByPetType = normalizedRegs;

  // Normalize originRequirements container
  const originObj = toObjectMaybeMapOrEntries(draft?.originRequirements);
  const normalizedOrigin = {};

  for (const [k, v] of Object.entries(originObj)) {
    normalizedOrigin[k] = normalizeOriginReq(v);
  }
  draft.originRequirements = normalizedOrigin;

  // Defensive defaults
  if (!Array.isArray(draft?.officialLinks)) draft.officialLinks = [];
  if (!draft.timestamp) draft.timestamp = new Date().toISOString();

  return draft;
}
