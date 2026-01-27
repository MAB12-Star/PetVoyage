// agents/extractor.mjs
import { openai } from "../openaiClient.mjs";
import { withTimeout } from "../utils/timeout.mjs";

export async function extractorAgent({
  countryName,
  researchPayload,
  existingJson,
  operatorNotes = "" // ✅ NEW
}) {
  console.log("   • Extractor: build schema JSON (JSON mode, no tools)");

  const notes = String(operatorNotes || "").trim();

  // Keep your schema hint (even though it's "mongoose-ish"), but make it clearly a hint.
  const schemaHint = `
You must output a JSON document with shape compatible with:
- destinationCountry: string
- regulationsByPetType: object/map keyed by petType (string)
  - vaccinations: object/map of subcategories (each has description + requirements[])
  - certifications: object/map of subcategories (each has description + requirements[])
  - microchip: string (HTML string like "<p>Not specified.</p>")
  - moreInfo: object/map (each has description + requirements[])
  - links: [{ name, url }]
- originRequirements: object/map (optional; keep empty object if unknown)
- officialLinks: [{ name, url }]  (MUST NOT be empty)
- sourceLastModified: string ISO date OR null
- sourceLastModifiedNote: string
- timestamp: string ISO date (ok)

Defaults:
- If unknown, use "<p>Not specified.</p>" and/or empty arrays/maps.
`;

  const operatorBlock = `
OPERATOR NOTES (HIGH PRIORITY CORRECTIONS):
These are human-provided corrections (ex: "Mexico requires rabies vaccination").
You must try to incorporate them into the output JSON.
Rules:
- Prefer aligning them with researchPayload sources when possible.
- If researchPayload does not support the note (missing sources), still incorporate the note but:
  - place it in the most relevant field (e.g., vaccinations.Rabies.requirements)
  - add a short mention in that section’s description like "<p>Operator note: ...</p>"
  - do NOT invent citations/links; do not add non-official URLs.
- If the note conflicts with sources in researchPayload, keep the official-source version and note the conflict in description.

${notes ? notes : "(none)"}
`.trim();

  const prompt = `
You are the EXTRACTOR agent.

Country: ${countryName}

Hard rules:
- Only include requirements supported by the sources summarized in researchPayload.
- HOWEVER: operator notes may indicate missing requirements. Incorporate them carefully (see operator notes rules).
- If a detail is not stated, use "<p>Not specified.</p>" and/or empty requirements[].
- Create an object for every pet type identified in researchPayload.petTypesFound.
- If multiple pet types have identical requirements, combine them into one key like "Dog & Cat".
- officialLinks must be government links for the country + USDA APHIS allowed.
- links inside each petType must be official URLs only.

${operatorBlock}

schemaHint:
${schemaHint}

researchPayload:
${JSON.stringify(researchPayload).slice(0, 60000)}

existingJson:
${existingJson ? JSON.stringify(existingJson).slice(0, 20000) : "None"}

Return ONLY JSON (no markdown).
`;

  const resp = await withTimeout(
    openai.responses.create({
      model: "gpt-5",
      input: prompt,
      text: { format: { type: "json_object" } }
    }),
    300000, // 5 minutes
    "extractor"
  );

  const data = JSON.parse(resp.output_text);

  if (!data.timestamp) data.timestamp = new Date().toISOString();
  if (!data.destinationCountry) data.destinationCountry = countryName;

  return data;
}
