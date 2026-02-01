// policy.mjs

export const ALLOW_USDA = true;

/**
 * Known official government HOSTNAMES ONLY.
 * ❗ Do NOT include protocol (https://) or paths.
 * ❗ This is intentional — we validate by hostname only.
 */
const KNOWN_GOV_HOSTS = new Set([

  // =====================
  // Albania
  // =====================
  "dogana.gov.al",
  "bujqesia.gov.al",

  // =====================
  // Algeria
  // =====================
  "douane.gov.dz",
  "madr.gov.dz",
  "psl.madr.gov.dz",

  // =====================
  // Anguilla
  // =====================
  "gov.ai",

  // =====================
  // Antigua and Barbuda
  // =====================
  "ab.gov.ag",
  "gov.ag",

  // =====================
  // Argentina
  // =====================
  "argentina.gob.ar",
  "senasa.gob.ar",

  // =====================
  // Armenia
  // =====================
  "gov.am",
  "www.gov.am",

  // =====================
  // Aruba
  // =====================
  "gobierno.aw",
  "douane.aw",
  "www.douane.aw",

  // =====================
  // Australia
  // =====================
  "agriculture.gov.au",
  "www.agriculture.gov.au",
  "abf.gov.au",
  "www.abf.gov.au",

  // =====================
  // Austria
  // =====================
  "sozialministerium.at",
  "www.sozialministerium.at",
  "bmaw.gv.at",
  "www.bmaw.gv.at",

  // =====================
  // Bahamas
  // =====================
  "www.bahamas.gov.bs",
  "bahamas.gov.bs",
  "gov.bs",
  "www.gov.bs",

  // =====================
  // Barbados
  // =====================
  "gov.bb",
  "www.gov.bb",

  // =====================
  // Belarus
  // =====================
  "gov.by",
  "www.gov.by",

  // =====================
  // Belgium
  // =====================
  "favv-afsca.be",
  "www.favv-afsca.be",
  "health.belgium.be",
  "www.health.belgium.be",

  // =====================
  // Belize
  // =====================
  "gov.bz",
  "www.gov.bz",

  // =====================
  // Bermuda
  // =====================
  "gov.bm",
  "www.gov.bm",

  // =====================
  // Bolivia
  // =====================
  "senasag.gob.bo",
  "www.senasag.gob.bo",
  "gob.bo",
  "www.gob.bo",

  // =====================
  // Botswana
  // =====================
  "gov.bw",
  "www.gov.bw",

  // =====================
  // Brazil
  // =====================
  "gov.br",
  "www.gov.br",

  // =====================
  // British Virgin Islands
  // =====================
  "gov.vg",
  "www.gov.vg",

  // =====================
  // Bulgaria
  // =====================
  "bfsa.bg",
  "www.bfsa.bg",
  "gov.bg",
  "www.gov.bg",

  // =====================
  // Burkina Faso
  // =====================
  "gouvernement.gov.bf",
  "www.gouvernement.gov.bf",
  "gov.bf",
  "www.gov.bf",

  // =====================
  // Canada
  // =====================
  "inspection.canada.ca",
  "www.inspection.canada.ca",
  "canada.ca",
  "www.canada.ca",

  // =====================
  // Canary Islands
  // =====================
  "mapa.gob.es",
  "www.mapa.gob.es",
  "lamoncloa.gob.es",
  "www.lamoncloa.gob.es",

  // =====================
  // Cayman Islands
  // =====================
  "gov.ky",
  "www.gov.ky",

  // =====================
  // Chile
  // =====================
  "sag.gob.cl",
  "www.sag.gob.cl",
  "gob.cl",
  "www.gob.cl",

  // =====================
  // China
  // =====================
  "customs.gov.cn",
  "www.customs.gov.cn",
  "moa.gov.cn",
  "www.moa.gov.cn",

  // =====================
  // Colombia
  // =====================
  "ica.gov.co",
  "www.ica.gov.co",
  "gov.co",
  "www.gov.co",

  // =====================
  // Congo (Brazzaville)
  // =====================
  "gouv.cg",
  "www.gouv.cg",
  "gov.cg",
  "www.gov.cg",

  // =====================
  // Costa Rica
  // =====================
  "senasa.go.cr",
  "www.senasa.go.cr",
  "go.cr",
  "www.go.cr",

  // =====================
  // Croatia
  // =====================
  "gov.hr",
  "www.gov.hr",

  // =====================
  // Curacao
  // =====================
  "gov.cw",
  "www.gov.cw",

  // =====================
  // Cyprus
  // =====================
  "gov.cy",
  "www.gov.cy",

  // =====================
  // Czech Republic
  // =====================
  "svscr.cz",
  "www.svscr.cz",
  "mze.cz",
  "www.mze.cz",

  // =====================
  // Denmark
  // =====================
  "foedevarestyrelsen.dk",
  "www.foedevarestyrelsen.dk",

  // =====================
  // Dominica
  // =====================
  "gov.dm",
  "www.gov.dm",

  // =====================
  // Dominican Republic
  // =====================
  "agricultura.gob.do",
  "www.agricultura.gob.do",
  "gob.do",
  "www.gob.do",

  // =====================
  // Ecuador
  // =====================
  "agricultura.gob.ec",
  "www.agricultura.gob.ec",
  "gob.ec",
  "www.gob.ec",

  // =====================
  // Egypt
  // =====================
  "mfa.gov.eg",
  "www.mfa.gov.eg",
  "cabinet.gov.eg",
  "www.cabinet.gov.eg",

  // =====================
  // El Salvador
  // =====================
  "mag.gob.sv",
  "www.mag.gob.sv",
  "gob.sv",
  "www.gob.sv",

  // =====================
  // England (Great Britain)
  // =====================
  "gov.uk",
  "www.gov.uk",

  // =====================
  // Estonia
  // =====================
  "agri.ee",
  "www.agri.ee",
  "pta.agri.ee",

  // =====================
  // Finland
  // =====================
  "ruokavirasto.fi",
  "www.ruokavirasto.fi",
  "valtioneuvosto.fi",
  "www.valtioneuvosto.fi",

  // =====================
  // France
  // =====================
  "gouv.fr",
  "www.gouv.fr",
  "douane.gouv.fr",
  "agriculture.gouv.fr",

  // =====================
  // French Guyana
  // =====================
  "gouv.fr",
  "www.gouv.fr",
  "douane.gouv.fr",
  "agriculture.gouv.fr",

  // =====================
  // Georgia
  // =====================
  "gov.ge",
  "www.gov.ge",
  "mepa.gov.ge",
  "www.mepa.gov.ge",

  // =====================
  // Great Britain
  // =====================
  "gov.uk",
  "www.gov.uk",

  // =====================
  // Great Britain (England, Scotland, Wales)
  // =====================
  "gov.uk",
  "www.gov.uk",

  // =====================
  // Greece
  // =====================
  "gov.gr",
  "www.gov.gr",

  // =====================
  // Grenada
  // =====================
  "gov.gd",
  "www.gov.gd",

  // =====================
  // Guadeloupe
  // =====================
  "gouv.fr",
  "www.gouv.fr",
  "douane.gouv.fr",
  "agriculture.gouv.fr",

  // =====================
  // Guatemala
  // =====================
  "maga.gob.gt",
  "www.maga.gob.gt",
  "gob.gt",
  "www.gob.gt",

  // =====================
  // Guinea
  // =====================
  "gouvernement.gov.gn",
  "www.gouvernement.gov.gn",
  "gov.gn",
  "www.gov.gn",

  // =====================
  // Honduras
  // =====================
  "sag.gob.hn",
  "www.sag.gob.hn",
  "gob.hn",
  "www.gob.hn",

  // =====================
  // Hong Kong
  // =====================
  "afcd.gov.hk",
  "www.afcd.gov.hk",
  "gov.hk",
  "www.gov.hk",

  // =====================
  // Hungary
  // =====================
  "nebih.gov.hu",
  "www.nebih.gov.hu",
  "kormany.hu",
  "www.kormany.hu",

  // =====================
  // Iceland
  // =====================
  "mast.is",
  "www.mast.is",
  "island.is",
  "www.island.is",
  "stjornarradid.is",
  "www.stjornarradid.is",

  // =====================
  // India
  // =====================
  "dahd.nic.in",
  "www.dahd.nic.in",
  "gov.in",
  "www.gov.in",

  // =====================
  // Indonesia
  // =====================
  "pertanian.go.id",
  "www.pertanian.go.id",
  "go.id",
  "www.go.id",

  // =====================
  // Iraq
  // =====================
  "gov.iq",
  "www.gov.iq",

  // =====================
  // Ireland
  // =====================
  "gov.ie",
  "www.gov.ie",

  // =====================
  // Isle of Man (UK)
  // =====================
  "gov.im",
  "www.gov.im",
  "gov.uk",
  "www.gov.uk",

  // =====================
  // Israel
  // =====================
  "gov.il",
  "www.gov.il",

  // =====================
  // Italy
  // =====================
  "salute.gov.it",
  "www.salute.gov.it",
  "politicheagricole.it",
  "www.politicheagricole.it",

  // =====================
  // Ivory Coast (Cote d'Ivoire)
  // =====================
  "gouv.ci",
  "www.gouv.ci",

  // =====================
  // Jamaica
  // =====================
  "moa.gov.jm",
  "www.moa.gov.jm",
  "gov.jm",
  "www.gov.jm",

  // =====================
  // Japan
  // =====================
  "maff.go.jp",
  "www.maff.go.jp",

  // =====================
  // Kazakhstan
  // =====================
  "gov.kz",
  "www.gov.kz",

  // =====================
  // Kenya
  // =====================
  "agriculture.go.ke",
  "www.agriculture.go.ke",
  "go.ke",
  "www.go.ke",

  // =====================
  // Korea
  // =====================
  "go.kr",
  "www.go.kr",

  // =====================
  // Kuwait
  // =====================
  "moh.gov.kw",
  "www.moh.gov.kw",
  "gov.kw",
  "www.gov.kw",

  // =====================
  // Kyrgyzstan
  // =====================
  "gov.kg",
  "www.gov.kg",

  // =====================
  // Latvia
  // =====================
  "pvd.gov.lv",
  "www.pvd.gov.lv",
  "gov.lv",
  "www.gov.lv",

  // =====================
  // Lithuania
  // =====================
  "vmvt.lt",
  "www.vmvt.lt",
  "lrv.lt",
  "www.lrv.lt",

  // =====================
  // Luxembourg
  // =====================
  "securite-alimentaire.public.lu",
  "gouvernement.lu",
  "www.gouvernement.lu",

  // =====================
  // Malaysia
  // =====================
  "dvs.gov.my",
  "www.dvs.gov.my",
  "gov.my",
  "www.gov.my",

  // =====================
  // Mali
  // =====================
  "gouv.ml",
  "www.gouv.ml",

  // =====================
  // Malta
  // =====================
  "gov.mt",
  "www.gov.mt",

  // =====================
  // Marshall Islands
  // =====================
  "gov.mh",
  "www.gov.mh",

  // =====================
  // Martinique
  // =====================
  "gouv.fr",
  "www.gouv.fr",
  "douane.gouv.fr",
  "agriculture.gouv.fr",

  // =====================
  // Mauritius
  // =====================
  "govmu.org",
  "www.govmu.org",
  "gov.mu",
  "www.gov.mu",

  // =====================
  // Mexico
  // =====================
  "gob.mx",
  "www.gob.mx",
  "senasica.gob.mx",
  "www.senasica.gob.mx",

  // =====================
  // Moldova
  // =====================
  "gov.md",
  "www.gov.md",

  // =====================
  // Montenegro
  // =====================
  "gov.me",
  "www.gov.me",

  // =====================
  // Morocco
  // =====================
  "gov.ma",
  "www.gov.ma",

  // =====================
  // Mozambique
  // =====================
  "gov.mz",
  "www.gov.mz",

  // =====================
  // Namibia
  // =====================
  "gov.na",
  "www.gov.na",

  // =====================
  // Netherlands
  // =====================
  "nvwa.nl",
  "www.nvwa.nl",
  "government.nl",
  "www.government.nl",

  // =====================
  // New Zealand
  // =====================
  "mpi.govt.nz",
  "www.mpi.govt.nz",
  "govt.nz",
  "www.govt.nz",

  // =====================
  // Nicaragua
  // =====================
  "gob.ni",
  "www.gob.ni",

  // =====================
  // Nigeria
  // =====================
  "gov.ng",
  "www.gov.ng",

  // =====================
  // North Macedonia
  // =====================
  "gov.mk",
  "www.gov.mk",

  // =====================
  // Northern Ireland
  // =====================
  "gov.uk",
  "www.gov.uk",

  // =====================
  // Norway
  // =====================
  "mattilsynet.no",
  "www.mattilsynet.no",
  "regjeringen.no",
  "www.regjeringen.no",

  // =====================
  // Pakistan
  // =====================
  "gov.pk",
  "www.gov.pk",

  // =====================
  // Panama
  // =====================
  "mida.gob.pa",
  "www.mida.gob.pa",
  "gob.pa",
  "www.gob.pa",

  // =====================
  // Paraguay
  // =====================
  "senacsa.gov.py",
  "www.senacsa.gov.py",
  "paraguay.gov.py",
  "www.paraguay.gov.py",

  // =====================
  // Peru
  // =====================
  "senasa.gob.pe",
  "www.senasa.gob.pe",
  "gob.pe",
  "www.gob.pe",

  // =====================
  // Philippines
  // =====================
  "baai.gov.ph",
  "www.baai.gov.ph",
  "gov.ph",
  "www.gov.ph",

  // =====================
  // Portugal
  // =====================
  "dgav.pt",
  "www.dgav.pt",
  "portugal.gov.pt",
  "www.portugal.gov.pt",

  // =====================
  // Romania
  // =====================
  "ansvsa.ro",
  "www.ansvsa.ro",
  "gov.ro",
  "www.gov.ro",

  // =====================
  // Russian Federation
  // =====================
  "gov.ru",
  "www.gov.ru",

  // =====================
  // Saudi Arabia
  // =====================
  "my.gov.sa",
  "www.my.gov.sa",
  "gov.sa",
  "www.gov.sa",

  // =====================
  // Scotland (Great Britain)
  // =====================
  "gov.uk",
  "www.gov.uk",

  // =====================
  // Senegal
  // =====================
  "gouv.sn",
  "www.gouv.sn",

  // =====================
  // Serbia
  // =====================
  "gov.rs",
  "www.gov.rs",

  // =====================
  // Singapore
  // =====================
  "sfa.gov.sg",
  "www.sfa.gov.sg",
  "gov.sg",
  "www.gov.sg",

  // =====================
  // Slovakia
  // =====================
  "svps.sk",
  "www.svps.sk",
  "gov.sk",
  "www.gov.sk",

  // =====================
  // Slovenia
  // =====================
  "gov.si",
  "www.gov.si",

  // =====================
  // South Africa
  // =====================
  "gov.za",
  "www.gov.za",
  "daff.gov.za",
  "www.daff.gov.za",

  // =====================
  // Spain
  // =====================
  "mapa.gob.es",
  "www.mapa.gob.es",
  "lamoncloa.gob.es",
  "www.lamoncloa.gob.es",

  // =====================
  // Sri Lanka
  // =====================
  "gov.lk",
  "www.gov.lk",

  // =====================
  // St. Kitts and Nevis
  // =====================
  "gov.kn",
  "www.gov.kn",

  // =====================
  // St. Lucia
  // =====================
  "gov.lc",
  "www.gov.lc",

  // =====================
  // St. Maarten
  // =====================
  "gov.sx",
  "www.gov.sx",

  // =====================
  // St. Vincent and the Grenadines
  // =====================
  "gov.vc",
  "www.gov.vc",

  // =====================
  // Sweden
  // =====================
  "jordbruksverket.se",
  "www.jordbruksverket.se",

  // =====================
  // Switzerland
  // =====================
  "blv.admin.ch",
  "www.blv.admin.ch",

  // =====================
  // Taiwan
  // =====================
  "gov.tw",
  "www.gov.tw",

  // =====================
  // Tanzania
  // =====================
  "gov.tz",
  "www.gov.tz",

  // =====================
  // Thailand
  // =====================
  "dld.go.th",
  "www.dld.go.th",
  "go.th",
  "www.go.th",

  // =====================
  // Trinidad and Tobago
  // =====================
  "gov.tt",
  "www.gov.tt",

  // =====================
  // Turkey
  // =====================
  "tarimorman.gov.tr",
  "www.tarimorman.gov.tr",
  "gov.tr",
  "www.gov.tr",

  // =====================
  // Turks and Caicos Islands
  // =====================
  "gov.tc",
  "www.gov.tc",

  // =====================
  // Ukraine
  // =====================
  "gov.ua",
  "www.gov.ua",

  // =====================
  // United Arab Emirates
  // =====================
  "u.ae",
  "www.u.ae",

  // =====================
  // United States
  // =====================
  "usa.gov",
  "www.usa.gov",
  "cdc.gov",
  "www.cdc.gov",
  "aphis.usda.gov",
  "www.aphis.usda.gov",
  "travel.state.gov",

  // =====================
  // Uruguay
  // =====================
  "gub.uy",
  "www.gub.uy",

  // =====================
  // Venezuela
  // =====================
  "gob.ve",
  "www.gob.ve",

  // =====================
  // Vietnam
  // =====================
  "gov.vn",
  "www.gov.vn",

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
