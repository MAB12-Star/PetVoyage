import { CountryPetRegulationSchema } from "../schema.mjs";
import { isAllowedUrl } from "../policy.mjs";
import { openai } from "../openaiClient.mjs";
import { withTimeout } from "../utils/timeout.mjs";

export function hardValidate(doc) {
  const parsed = CountryPetRegulationSchema.parse(doc);

  if (!parsed.officialLinks || parsed.officialLinks.length === 0) {
    throw new Error("officialLinks must not be empty.");
  }

  for (const link of parsed.officialLinks) {
    if (!isAllowedUrl(link.url)) throw new Error(`Disallowed officialLinks URL: ${link.url}`);
  }

  for (const [petType, details] of Object.entries(parsed.regulationsByPetType || {})) {
    if (/^\d+$/.test(petType)) throw new Error(`Invalid petType key (numeric): ${petType}`);
    for (const link of details.links || []) {
      if (!isAllowedUrl(link.url)) throw new Error(`Disallowed link in ${petType}: ${link.url}`);
    }
  }

  return parsed;
}

export async function validatorAgentExplain({ draftDoc }) {
  const prompt = `
You are the VALIDATOR agent (explain-only).

Return ONLY JSON:
{ "ok": boolean, "issues": string[] }

Check for:
- schema mismatches
- disallowed sources (non-gov domains, except USDA APHIS allowed)
- suspicious invented details not supported by official sources summary

JSON:
${JSON.stringify(draftDoc).slice(0, 60000)}
`;

  const resp = await withTimeout(
    openai.responses.create({
      model: "gpt-5",
      input: prompt,
      text: { format: { type: "json_object" } }
    }),
    45000,
    "validator explain"
  );

  return JSON.parse(resp.output_text);
}
