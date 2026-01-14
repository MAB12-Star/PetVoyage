const mongoose = require("mongoose");

const PetRegulationDetailSchema = new mongoose.Schema({
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

module.exports = mongoose.model(
  "CountryPetRegulation",
  CountryPetRegulationSchema,
  "country_regulations_list"
);
