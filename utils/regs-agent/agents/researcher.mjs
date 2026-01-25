// agents/researcher.mjs
import { openai } from "../openaiClient.mjs";
import { extractFirstJsonObject } from "../utils/json.mjs";
import { withTimeout } from "../utils/timeout.mjs";
import { isAllowedUrl } from "../policy.mjs";

function uniq(arr = []) {
  return [...new Set(arr.filter(Boolean))];
}

function filterLinks(arr) {
  return (Array.isArray(arr) ? arr : [])
    .filter((l) => l?.url && isAllowedUrl(l.url))
    .map((l) => ({
      name: String(l.name || "Link").trim() || "Link",
      url: String(l.url).trim()
    }));
}

export async function researcherAgent({
  countryName,
  existingJson,
  seedUrls = [],
  manualUrls = [],
  researchMode = "seed_first" // "provided_only" | "seed_first" | "deep"
}) {
  const seeds = uniq(seedUrls).slice(0, 12);   // DB-derived official links
  const manual = uniq(manualUrls).slice(0, 20); // UI-provided links (one per line)
  const hasSeeds = seeds.length > 0;
  const hasManual = manual.length > 0;

  const providedOnly = researchMode === "provided_only";
  const deep = researchMode === "deep";
  const seedFirst = researchMode === "seed_first" || deep;

  // -----------------------------
  // 1) Research report (non-JSON)
  // -----------------------------
  const modeLabel = providedOnly
    ? "[provided_only]"
    : deep
    ? "[deep]"
    : "[seed_first]";

  console.log(`   • Researcher: web_search (non-JSON mode) ${modeLabel}`);

  const seedFirstPrompt = `
You are the RESEARCHER agent.

Country: ${countryName}

Goal:
Find OFFICIAL import rules for companion animals entering ${countryName}.

CRITICAL INSTRUCTION:
You MUST start from the provided SEED URLS (from our database).
Do NOT use any non-government sites. Do NOT use visa/travel sites, blogs, forums, airline summaries.
USDA APHIS (aphis.usda.gov) is allowed as supplemental.

Seed URLs (start here; prioritize these):
${seeds.map((u) => `- ${u}`).join("\n")}

What to do:
1) Use web_search to open/check ONLY these seed URLs (and their official child links).
2) Follow at most 5 child links TOTAL (PDFs/forms) if they are official and relevant.
3) Extract:
   - officialLinks (main gov pages)
   - childLinks (PDF/forms) - analyze PDFs if present
   - revision/last updated dates found (url + date + note)
   - pet types explicitly mentioned
   - notes about missing/unclear areas

Output: Write a concise report (NOT JSON) with:
- officialLinks: name + url
- childLinks: name + url
- revision/last-updated dates found (url + date + note)
- pet types explicitly mentioned
- notes about missing/unclear areas

Existing JSON (may be outdated/wrong):
${existingJson ? JSON.stringify(existingJson).slice(0, 20000) : "None"}
`;

  const broadPrompt = `
You are the RESEARCHER agent.

Country: ${countryName}

Goal:
Find OFFICIAL import rules for companion animals entering ${countryName}.
Prioritize the national veterinary/animal health authority and official government portals.

Rules:
- OFFICIAL GOVERNMENT sources only.
- Allowed: government domains + USDA APHIS (aphis.usda.gov) as supplemental.
- DO NOT use blogs, forums, airline summaries, visa/travel sites.
- HARD LIMIT: open at most 3 child links total (PDFs/forms). If slow, skip.

Search strategy:
1) Find the official veterinary authority page(s) for importing pets into ${countryName}.
2) Find official government portal pages about bringing pets/animals into ${countryName}.
3) Find official PDFs/forms referenced by those pages (max 3).

Output: Write a concise report (NOT JSON) with:
- officialLinks: name + url
- childLinks: name + url
- revision/last-updated dates found (url + date + note)
- pet types explicitly mentioned
- notes about missing/unclear areas

Existing JSON (may be outdated/wrong):
${existingJson ? JSON.stringify(existingJson).slice(0, 20000) : "None"}
`;

  let researchText = "";

  // ---- Mode: provided_only ----
  if (providedOnly) {
    if (!hasManual) {
      return {
        country: countryName,
        petTypesFound: [],
        officialLinks: [],
        childLinks: [],
        sourceDates: [],
        notes: ["provided_only mode selected but no manualUrls were provided."]
      };
    }

    const providedPrompt = `
You are the RESEARCHER agent.

Country: ${countryName}

CRITICAL:
- Use ONLY the PROVIDED URLS below.
- Do NOT search the open web beyond these URLs.
- Follow only official child links from these pages (PDFs/forms). Max 5 child links.

Provided URLs:
${manual.map((u) => `- ${u}`).join("\n")}

Output: Write a concise report (NOT JSON) with:
- officialLinks: name + url
- childLinks: name + url
- revision/last-updated dates found (url + date + note)
- pet types explicitly mentioned
- notes about missing/unclear areas
`;

    const resp = await withTimeout(
      openai.responses.create({
        model: "gpt-5",
        input: providedPrompt,
        tools: [{ type: "web_search" }]
      }),
      120000,
      "researcher web_search (provided_only)"
    );

    researchText = resp.output_text || "";
  } else {
    // ---- Mode: seed_first or deep ----

    // Seed-first phase (if we have seeds)
    if (seedFirst && hasSeeds) {
      const seedResp = await withTimeout(
        openai.responses.create({
          model: "gpt-5",
          input: seedFirstPrompt,
          tools: [{ type: "web_search" }]
        }),
        120000,
        "researcher web_search (seed-first)"
      );

      researchText = seedResp.output_text || "";
    }

    const looksEmpty = !researchText || researchText.trim().length < 400;

    // Broad phase:
    // - seed_first: only if seed results are weak or no seeds
    // - deep: always do broad (even if seed results are good)
    if (deep || looksEmpty || !hasSeeds) {
      const broadResp = await withTimeout(
        openai.responses.create({
          model: "gpt-5",
          input: broadPrompt,
          tools: [{ type: "web_search" }]
        }),
        150000,
        "researcher web_search (broad)"
      );

      const broadText = broadResp.output_text || "";
      researchText = researchText
        ? `${researchText}\n\n---\n\n(Broad results)\n${broadText}`
        : broadText;
    }
  }

  // -----------------------------------------
  // 2) Convert report → JSON (JSON mode, no tools)
  // -----------------------------------------
  console.log("   • Researcher: convert report → JSON (JSON mode, no tools)");

  const prompt2 = `
Convert the following report into STRICT JSON ONLY.

Return JSON with EXACT keys:
{
  "country": string,
  "petTypesFound": string[],
  "officialLinks": [{"name": string, "url": string}],
  "childLinks": [{"name": string, "url": string}],
  "sourceDates": [{"url": string, "date": string, "note": string}],
  "notes": string[]
}

Rules:
- officialLinks/childLinks: only gov URLs for the country + USDA APHIS allowed.
- Remove duplicates.
- If no dates found, sourceDates: [].
- If a provided/manual URL or seed URL is official and relevant, include it even if not repeated elsewhere.

REPORT:
${researchText.slice(0, 80000)}
`;

  const jsonResp = await withTimeout(
    openai.responses.create({
      model: "gpt-5",
      input: prompt2,
      text: { format: { type: "json_object" } }
    }),
    1000000,
    "researcher json conversion"
  );

  let data;
  try {
    data = JSON.parse(jsonResp.output_text);
  } catch {
    data = extractFirstJsonObject(jsonResp.output_text);
  }

  if (!data) {
    data = {
      country: countryName,
      petTypesFound: [],
      officialLinks: [],
      childLinks: [],
      sourceDates: [],
      notes: ["Failed to parse researcher JSON output."]
    };
  }

  if (!data.country) data.country = countryName;

  // Ensure arrays exist
  data.petTypesFound = Array.isArray(data.petTypesFound) ? data.petTypesFound : [];
  data.officialLinks = Array.isArray(data.officialLinks) ? data.officialLinks : [];
  data.childLinks = Array.isArray(data.childLinks) ? data.childLinks : [];
  data.sourceDates = Array.isArray(data.sourceDates) ? data.sourceDates : [];
  data.notes = Array.isArray(data.notes) ? data.notes : [];

  // Filter by your policy allowlist/gov rules
  data.officialLinks = filterLinks(data.officialLinks);
  data.childLinks = filterLinks(data.childLinks);
  data.sourceDates = data.sourceDates
    .filter((d) => d?.url && isAllowedUrl(d.url))
    .map((d) => ({
      url: String(d.url).trim(),
      date: String(d.date || "").trim(),
      note: String(d.note || "").trim()
    }));

  // Traceability notes
  data.notes.unshift(`researchMode=${researchMode}`);
  if (hasSeeds) data.notes.unshift(`Seed URLs available: ${seeds.length}`);
  if (hasManual) data.notes.unshift(`Manual URLs provided: ${manual.length}`);

  return data;
}
