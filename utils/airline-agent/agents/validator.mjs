import { AirlinePolicySchema } from "../schema.mjs";
import { openai } from "../openaiClient.mjs";
import { withTimeout } from "../utils/timeout.mjs";

  const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

  export function hardValidate(doc, { airlineCode } = {}) {
    const parsed = AirlinePolicySchema.parse(doc);

    if (airlineCode && String(parsed.airlineCode).toUpperCase() !== String(airlineCode).toUpperCase()) {
      throw new Error(`airlineCode mismatch: expected ${airlineCode}, got ${parsed.airlineCode}`);
    }

    parsed.inCompartmentAnimals = uniq(parsed.inCompartmentAnimals);
    parsed.inCargoAnimals = uniq(parsed.inCargoAnimals);
    parsed.healthVaccinations = uniq(parsed.healthVaccinations);

    // Prevent inconsistent UI states
    if (parsed.inCompartment === "no") parsed.inCompartmentAnimals = [];
    if (parsed.inCargo === "no") parsed.inCargoAnimals = [];

    if (parsed.dangerousBreeds === "no") parsed.dangerousBreedList = "";
    if (parsed.brachycephalic === "no") parsed.brachycephalicBreedList = "";
    if (parsed.serviceAnimals === "no") parsed.serviceAnimalDetails = "";
    if (parsed.esAnimals === "no") parsed.esaDetails = "";

    if (!parsed.timestamp) parsed.timestamp = new Date().toISOString();
    parsed.airlineCode = String(parsed.airlineCode).trim().toUpperCase();

    return parsed;
  }

  export async function validatorAgentExplain({ draftDoc }) {
    const prompt = `
  You are the VALIDATOR agent (explain-only).

  Return ONLY JSON:
  { "ok": boolean, "issues": string[] }

  Check for:
  - missing keys expected by airline policy schema
  - invalid yes/no fields (must be "yes" or "no")
  - invalid animals (Cat/Dog/Bird/Reptile)
  - invalid vaccinations enum
  - URL fields must be http(s) or empty

  JSON:
  ${JSON.stringify(draftDoc).slice(0, 60000)}
  `;

    const resp = await withTimeout(
      openai.responses.create({
        model: "gpt-5",
        input: prompt,
        text: { format: { type: "json_object" } },
      }),
      45000,
      "validator explain"
    );

    return JSON.parse(resp.output_text);
  }
