import { openai } from "../openaiClient.mjs";
import { withTimeout } from "../utils/timeout.mjs";

export async function extractorAgent({ countryName, researchPayload, existingJson }) {
  console.log("   • Extractor: build schema JSON (JSON mode, no tools)");

  const schemaHint = `
Output JSON must match:
{({
  vaccinations: {
    type: Map,
    of: new mongoose.Schema({
      description: { type: String, default: "<p>Not specified.</p>" },
      requirements: { type: [String], default: [] }
    }, { _id: false }),
    default: {}
  },
  certifications: {
    type: Map,
    of: new mongoose.Schema({
      description: { type: String, default: "<p>Not specified.</p>" },
      requirements: { type: [String], default: [] }
    }, { _id: false }),
    default: {}
  },
  microchip: { type: String, default: "<p>Not specified.</p>" },
  moreInfo: {
  type: Map,
  of: new mongoose.Schema({
    description: { type: String, default: "<p>Not specified.</p>" },
    requirements: { type: [String], default: [] }
  }, { _id: false }),
  default: {}
},

  links: [
    {
      name: { type: String, required: true },
      url: { type: String, required: true }
    }
  ]
  
}, { _id: false });

const OriginRequirementSchema = new mongoose.Schema({
  appliesTo: [{ type: String }], // e.g., ["dog"]
  details: { type: String, required: true }
}, { _id: false });

const CountryPetRegulationSchema = new mongoose.Schema({
  destinationCountry: {
    type: String,
    required: true  
  },

  regulationsByPetType: {
    type: Map,
    of: PetRegulationDetailSchema,
    default: {}
    // keys can be "dog", "cat", "bird", "reptile", "other"
  },

  originRequirements: {
    type: Map,
    of: OriginRequirementSchema,
    default: {}
    // keys like "footAndMouthDisease", "screwworm", etc.
  },

  officialLinks: {
    type: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true }
      }
    ],
    default: []
  },
  
   // ✅ NEW: Research-tracked fields (for crawlers)
  sourceLastModified: { type: Date, default: null },          // date shown on the source page
  sourceLastModifiedNote: { type: String, default: '' },      // optional "code"/note from research


  source_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "country_pet_regulations"
  },

  // (optional) keep your timestamp if you want, but it becomes redundant:
    timestamp: { type: Date, default: Date.now }
  },
  { timestamps: true }, // ✅ adds createdAt + updatedAt and maintains them
);
}
`;

  const prompt = `
You are the EXTRACTOR agent.

Country: ${countryName}

Hard rules:
- Only include requirements supported by the sources summarized in researchPayload.
- If a detail is not stated, use "<p>Not specified.</p>" and/or empty requirements[].
- Create an object for every pet type identified in researchPayload.petTypesFound.
- If multiple pet types have identical requirements, combine them into one key like "Dog & Cat".
- officialLinks must be government links for the country + USDA APHIS allowed.

schemaHint:
${schemaHint}

researchPayload:
${JSON.stringify(researchPayload).slice(0, 60000)}

existingJson:
${existingJson ? JSON.stringify(existingJson).slice(0, 20000) : "None"}

Return ONLY JSON.
`;

  const resp = await withTimeout(
  openai.responses.create({
    model: "gpt-5",
    input: prompt,
    text: { format: { type: "json_object" } }
  }),
  300000, // ⬅️ 5 minutes
  "extractor"
);


  const data = JSON.parse(resp.output_text);

  if (!data.timestamp) data.timestamp = new Date().toISOString();
  if (!data.destinationCountry) data.destinationCountry = countryName;

  return data;
}
