// agents/researcher.mjs
import { openai } from "../openaiClient.mjs";
import { extractFirstJsonObject } from "../utils/json.mjs";
import { withTimeout } from "../utils/timeout.mjs";
import { buildAllowedHostsFromAirline, isAllowedUrl } from "../allowlist.mjs";

function uniq(arr = []) {
  return [...new Set(arr.filter(Boolean))];
}

function filterLinks(arr, allowedHosts) {
  return (Array.isArray(arr) ? arr : [])
    .filter((l) => l?.url && isAllowedUrl(l.url, allowedHosts))
    .map((l) => ({
      name: String(l.name || "Link").trim() || "Link",
      url: String(l.url).trim(),
    }));
}

// helper: capture links that are NOT allowed (so we can show them as "non-official")
function collectNonOfficialLinks(arr, allowedHosts) {
  return (Array.isArray(arr) ? arr : [])
    .filter((l) => l?.url && !isAllowedUrl(l.url, allowedHosts))
    .map((l) => String(l.url).trim())
    .filter(Boolean);
}

export async function researcherAgent({
  airlineCode,
  existingAirline,
  manualUrls = [],
  researchMode = "seed_first", // "provided_only" | "seed_first" | "deep" | "deep_relaxed"
  operatorNotes = "",
  onProgress = () => {},
}) {
  const manual = uniq(manualUrls).slice(0, 25);
  const providedOnly = researchMode === "provided_only";
  const deep = researchMode === "deep";
  const deepRelaxed = researchMode === "deep_relaxed";

  // allowlist derived from airline identity + manual urls
  const allowedHosts = buildAllowedHostsFromAirline(existingAirline, manual);

  const notesBlock = String(operatorNotes || "").trim();

  const operatorInstructions = `
OPERATOR NOTES (HIGH PRIORITY CORRECTIONS):
These are human corrections. Verify using official airline sources when possible.
If a note cannot be verified from official airline sources, you may still report it as "operator note (unverified)" but DO NOT invent links.

${notesBlock ? notesBlock : "(none)"}
`.trim();

  const seedUrls = uniq([
    existingAirline?.petPolicyURL,
    existingAirline?.airlineURL,
    ...manual,
  ]).filter(Boolean);

  const modeLabel =
    providedOnly ? "[provided_only]" :
    deepRelaxed ? "[deep_relaxed]" :
    deep ? "[deep]" :
    "[seed_first]";

  onProgress(`Researcher: web_search ${modeLabel}`);

  // ---------- PROMPTS ----------
  const allowlistBlock = `
Allowed sources:
ONLY URLs whose host is within this allowlist (or subdomains):
${[...allowedHosts].map((h) => `- ${h}`).join("\n")}
`.trim();

  const seedFirstPrompt = `
You are the RESEARCHER agent for airline pet policy.

Airline: ${existingAirline?.name || ""} (${airlineCode})

Goal:
Find the airline's OFFICIAL pet policy rules (in-cabin, cargo, fees, carriers, breed restrictions, service animals, ESAs, embargoes, crate sizes).

${allowlistBlock}

${operatorInstructions}

CRITICAL:
Start from the provided SEED URLS. Follow only official child links from those pages.

Seed URLs:
${seedUrls.map((u) => `- ${u}`).join("\n")}

Output (NOT JSON):
- officialLinks: name + url (allowed hosts only)
- sourceDates: any "last updated" info (url + date + note)
- policyFindings: bullet points for the main rules
- operatorNotesResolution
- notes
`;

  const broadPrompt = `
You are the RESEARCHER agent for airline pet policy.

Airline: ${existingAirline?.name || ""} (${airlineCode})

${allowlistBlock}

${operatorInstructions}

If the airline site is hard to navigate, search WITHIN allowed hosts for:
- "pet policy"
- "traveling with pets"
- "in cabin pet"
- "cargo pet"
- "service animal"
- "emotional support animal"

Output (NOT JSON):
- officialLinks: name + url (allowed hosts only)
- sourceDates
- policyFindings
- operatorNotesResolution
- notes
`;

  // ✅ NEW: deep_relaxed prompt (search entire web)
  const deepRelaxedPrompt = `
You are the RESEARCHER agent for airline pet policy.

Airline: ${existingAirline?.name || ""} (${airlineCode})

Goal:
Get the most accurate pet policy info possible.

PRIMARY REQUIREMENT:
1) First try to find OFFICIAL airline pages (ideally on the airline's own domain, or their official cargo partner if that is the airline's official process).
2) If official pages are inaccessible / JS-only / blocked, you MAY use reputable secondary sources ONLY to fill gaps, but you MUST:
   - clearly label them "NON-OFFICIAL"
   - never claim they are official
   - still try to locate at least one official URL

${operatorInstructions}

Search guidance:
- Try the airline domain first (even if JS-heavy)
- Then search the web for:
  "${existingAirline?.name || ""} travelling with pets"
  "${existingAirline?.name || ""} pet in cabin fee"
  "${existingAirline?.name || ""} pets cargo policy"
  "${existingAirline?.name || ""} service animal policy"
- Prefer: airline.com pages, official cargo partner pages referenced by airline, official PDFs.

Output (NOT JSON) with TWO sections:
A) OFFICIAL FINDINGS
- officialLinks: name + url
- sourceDates
- policyFindings

B) NON-OFFICIAL (ONLY IF NEEDED)
- nonOfficialLinks: url list
- nonOfficialFindings: bullet points (label as non-official)
- risks/uncertainty: what could not be verified

Also include:
- notes
`;

  let researchText = "";

  // ---------- RUN WEB_SEARCH ----------
  if (providedOnly) {
    if (!manual.length) {
      return {
        airlineCode,
        officialLinks: [],
        sourceDates: [],
        notes: ["provided_only selected but no manualUrls were provided."],
        policyFindings: [],
      };
    }

    const providedPrompt = `
You are the RESEARCHER agent.

Airline: ${existingAirline?.name || ""} (${airlineCode})

${allowlistBlock}

${operatorInstructions}

CRITICAL:
Use ONLY the PROVIDED URLS below. Do NOT browse beyond them.

Provided URLs:
${manual.map((u) => `- ${u}`).join("\n")}

Output (NOT JSON):
- officialLinks
- sourceDates
- policyFindings
- operatorNotesResolution
- notes
`;

    const resp = await withTimeout(
      openai.responses.create({
        model: "gpt-5",
        input: providedPrompt,
        tools: [{ type: "web_search" }],
      }),
      360000,
      "researcher web_search (provided_only)"
    );

    researchText = resp.output_text || "";
  } else {
    // seed_first/deep: start from seed-first
    const seedResp = await withTimeout(
      openai.responses.create({
        model: "gpt-5",
        input: seedFirstPrompt,
        tools: [{ type: "web_search" }],
      }),
      360000,
      "researcher web_search (seed_first)"
    );

    researchText = seedResp.output_text || "";

    const looksEmpty = !researchText || researchText.trim().length < 300;

    // deepRelaxed: broaden to whole web if needed
    if (deepRelaxed) {
      const relaxedResp = await withTimeout(
        openai.responses.create({
          model: "gpt-5",
          input: deepRelaxedPrompt,
          tools: [{ type: "web_search" }],
        }),
        360000,
        "researcher web_search (deep_relaxed)"
      );

      const relaxedText = relaxedResp.output_text || "";
      researchText = researchText
        ? `${researchText}\n\n---\n\n(Deep relaxed results)\n${relaxedText}`
        : relaxedText;
    } else if (deep || looksEmpty) {
      const broadResp = await withTimeout(
        openai.responses.create({
          model: "gpt-5",
          input: broadPrompt,
          tools: [{ type: "web_search" }],
        }),
        360000,
        "researcher web_search (broad)"
      );

      const broadText = broadResp.output_text || "";
      researchText = researchText
        ? `${researchText}\n\n---\n\n(Broad results)\n${broadText}`
        : broadText;
    }
  }

  // ---------- CONVERT TO JSON ----------
  onProgress("Researcher: convert report → JSON");

  // ✅ Ask for optional nonOfficialLinks in conversion output.
  const prompt2 = `
Convert the following report into STRICT JSON ONLY.

Return JSON with EXACT keys:
{
  "airlineCode": string,
  "officialLinks": [{"name": string, "url": string}],
  "nonOfficialLinks": [{"name": string, "url": string}],
  "sourceDates": [{"url": string, "date": string, "note": string}],
  "policyFindings": string[],
  "notes": string[]
}

Rules:
- officialLinks MUST be official airline sources when possible.
- nonOfficialLinks should contain any secondary sources used (if any).
- We will FILTER officialLinks by allowlist; nonOfficialLinks may contain anything.
- Remove duplicates.

REPORT:
${researchText.slice(0, 80000)}
`;

  const jsonResp = await withTimeout(
    openai.responses.create({
      model: "gpt-5",
      input: prompt2,
      text: { format: { type: "json_object" } },
    }),
    450000,
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
      airlineCode,
      officialLinks: [],
      nonOfficialLinks: [],
      sourceDates: [],
      policyFindings: [],
      notes: ["Failed JSON parse."],
    };
  }

  data.airlineCode = airlineCode;

  const originalOfficialLinks = Array.isArray(data.officialLinks) ? data.officialLinks : [];
  data.officialLinks = filterLinks(originalOfficialLinks, allowedHosts);

  // anything the model put into officialLinks that isn't in allowlist -> treat as nonOfficialLinks
  const leaked = collectNonOfficialLinks(originalOfficialLinks, allowedHosts);

  const nonOfficialFromModel = Array.isArray(data.nonOfficialLinks) ? data.nonOfficialLinks : [];
  const nonOfficialUrls = uniq([
    ...nonOfficialFromModel.map((l) => l?.url).filter(Boolean),
    ...leaked,
  ]).map((u) => ({ name: "Non-official source", url: String(u).trim() }));

  data.nonOfficialLinks = nonOfficialUrls;

  data.sourceDates = (Array.isArray(data.sourceDates) ? data.sourceDates : [])
    .filter((d) => d?.url)
    .map((d) => ({
      url: String(d.url).trim(),
      date: String(d.date || "").trim(),
      note: String(d.note || "").trim(),
    }));

  data.policyFindings = Array.isArray(data.policyFindings) ? data.policyFindings : [];
  data.notes = Array.isArray(data.notes) ? data.notes : [];

  // add mode + allowlist info
  data.notes.unshift(`researchMode=${researchMode}`);
  if (notesBlock) data.notes.unshift("Operator notes present: YES");
  data.notes.unshift(`AllowedHosts=${[...allowedHosts].length}`);

  // ✅ safety flag: deep_relaxed with no official links
  if (deepRelaxed && (!data.officialLinks || data.officialLinks.length === 0) && data.nonOfficialLinks.length) {
    data.notes.unshift("WARNING: deep_relaxed used non-official sources because no official policy page was extracted. Do not publish without manual verification.");
  }

  return data;
}
