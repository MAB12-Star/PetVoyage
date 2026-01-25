// policy.mjs

export const ALLOW_USDA = true;

/**
 * Known official government HOSTNAMES ONLY.
 * ❗ Do NOT include protocol (https://) or paths.
 * ❗ This is intentional — we validate by hostname only.
 */
const KNOWN_GOV_HOSTS = new Set([
  // =====================
  // Algeria
  // =====================
  "douane.gov.dz",
  "psl.madr.gov.dz",

  // =====================
  // Albania
  // =====================
  "dogana.gov.al",
  "bujqesia.gov.al",

  // =====================
  // Argentina
  // =====================
  "argentina.gob.ar",
  "senasa.gob.ar",

  // =====================
  // Anguilla
  // =====================
  "gov.ai",

  // =====================
  // Aruba
  // =====================
  "gobierno.aw",
  "douane.aw",
  "www.douane.aw",


  // =====================
  // Bahamas
  // =====================
  "gov.bs",

  // =====================
  // Barbados
  // =====================
  "gov.bb",

  // =====================
  // Belarus
  // =====================
  "gov.by",

  // =====================
  // Belize
  // =====================
  "gov.bz",
  "org.bz",

  // =====================
  // Botswana
  // =====================
  "gov.bw",

  // =====================
  // British Virgin Islands
  // =====================

  "gov.vg",
  
]);

/**
 * Determines whether a URL is allowed to appear in:
 * - officialLinks
 * - regulationsByPetType[*].links
 *
 * Rules:
 * - Destination-country government domains allowed
 * - Subdomains allowed
 * - USDA APHIS allowed if ALLOW_USDA=true
 */
export function isAllowedUrl(url) {
  try {
    if (!url || typeof url !== "string") return false;

    // Clean whitespace / line breaks defensively
    const clean = url.replace(/\s+/g, "").trim();
    const u = new URL(clean);
    const host = u.hostname.toLowerCase();

    // ---------------------
    // Explicit allowlist (exact host)
    // ---------------------
    if (KNOWN_GOV_HOSTS.has(host)) return true;

    // ---------------------
    // Allow subdomains of known hosts
    // ---------------------
    for (const allowed of KNOWN_GOV_HOSTS) {
      if (host === allowed || host.endsWith(`.${allowed}`)) {
        return true;
      }
    }

    // ---------------------
    // Broad government patterns (fallback)
    // ---------------------
    const isGov =
      host.endsWith(".gov") ||
      host.includes(".gov.") ||
      host.includes(".gob.") ||
      host.includes(".gouv.") ||
      host.includes(".govt.") ||
      host.endsWith(".go.");

    // ---------------------
    // USDA APHIS exception
    // ---------------------
    const isUSDA =
      ALLOW_USDA &&
      (host === "aphis.usda.gov" || host.endsWith(".aphis.usda.gov"));

    return isGov || isUSDA;
  } catch {
    return false;
  }
}
