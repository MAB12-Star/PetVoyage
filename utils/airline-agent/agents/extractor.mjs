import { openai } from "../openaiClient.mjs";
import { withTimeout } from "../utils/timeout.mjs";

function pickExisting(existingAirline) {
  const e = existingAirline || {};
  return {
    airlineCode: String(e.airlineCode || "").trim().toUpperCase(),
    petPolicyURL: e.petPolicyURL || "",
    airlineURL: e.airlineURL || "",

    PetPolicySummary: e.PetPolicySummary || "",
    ImprovedPetPolicySummary: e.ImprovedPetPolicySummary || "",

    microchip: e.microchip || "no",
    healthCertificate: e.healthCertificate || "no",

    inCompartment: e.inCompartment || "no",
    inCompartmentAnimals: Array.isArray(e.inCompartmentAnimals) ? e.inCompartmentAnimals : [],
    inCompartmentDetails: e.inCompartmentDetails || "",

    inCargo: e.inCargo || "no",
    inCargoAnimals: Array.isArray(e.inCargoAnimals) ? e.inCargoAnimals : [],
    inCargoDetails: e.inCargoDetails || "",

    carrierCompartmentDetails: e.carrierCompartmentDetails || "",
    carrierCargoDetails: e.carrierCargoDetails || "",

    dangerousBreeds: e.dangerousBreeds || "no",
    dangerousBreedList: e.dangerousBreedList || "",

    brachycephalic: e.brachycephalic || "no",
    brachycephalicBreedList: e.brachycephalicBreedList || "",

    serviceAnimals: e.serviceAnimals || "no",
    serviceAnimalDetails: e.serviceAnimalDetails || "",

    esAnimals: e.esAnimals || "no",
    esaDetails: e.esaDetails || "",

    petShipping: e.petShipping || "no",

    healthVaccinations: Array.isArray(e.healthVaccinations) ? e.healthVaccinations : [],

    timestamp: new Date().toISOString(),
  };
}

export async function extractorAgent({
  airlineCode,
  researchPayload,
  existingAirline,
  operatorNotes = "",
}) {
  console.log("   • Extractor: build AIRLINE schema JSON (JSON mode, no tools)");

  const base = pickExisting(existingAirline);
  base.airlineCode = String(airlineCode || base.airlineCode || "").trim().toUpperCase();

  // If research failed, DO NOT invent content. Return base as draft.
  if (researchPayload?.ok === false || researchPayload?.stage === "research_failed") {
    return {
      ...base,
      PetPolicySummary: base.PetPolicySummary || "",
      ImprovedPetPolicySummary: base.ImprovedPetPolicySummary || "",
      timestamp: new Date().toISOString(),
    };
  }

  const prompt = `
You are the EXTRACTOR agent for AIRLINE pet policies.

Return STRICT JSON ONLY. You MUST return ALL keys from the BASE object.

Hard rules:
- Only update a field if the researchPayload extractedText or sources clearly supports it.
- If not supported, keep the BASE value.
- Do not hallucinate. Prefer conservative "no" when truly unknown.
- ImprovedPetPolicySummary may be HTML.

BASE (existing airline values; keep unless proven otherwise):
${JSON.stringify(base).slice(0, 22000)}

researchPayload (summarized policy content + links):
${JSON.stringify(researchPayload).slice(0, 60000)}

operatorNotes (may add missing facts; use carefully):
${String(operatorNotes || "").slice(0, 6000)}

Return ONLY JSON.
`;

  const resp = await withTimeout(
    openai.responses.create({
      model: "gpt-5",
      input: prompt,
      text: { format: { type: "json_object" } },
    }),
    240000,
    "airline extractor"
  );

  const data = JSON.parse(resp.output_text || "{}");
  data.airlineCode = base.airlineCode;
  if (!data.timestamp) data.timestamp = new Date().toISOString();

  return data;
}
