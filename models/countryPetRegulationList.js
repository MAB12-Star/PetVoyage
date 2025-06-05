const mongoose = require("mongoose");

const CountryPetRegulationSchema = new mongoose.Schema({
  originCountry: {
    type: String,
    required: true,
    default: "United States"
  },
  destinationCountry: {
    type: String,
    required: true
  },
  petType: {
    type: String,
    enum: ["Dog", "Cat", "Other"],
    required: true
  },
  vaccinations: {
    type: String, // stored as HTML
    default: "<p>Not specified.</p>"
  },
  certifications: {
    type: String,
    default: "<p>Not specified.</p>"
  },
  microchip: {
    type: String,
    default: "<p>Not specified.</p>"
  },
  assistancePet: {
    type: String,
    default: "<p>Not specified.</p>"
  },
  description: {
    type: String,
    default: "<p>No description available.</p>"
  },
  link: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  source_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "country_pet_regulations"
  }
});

// ✅ Correct schema name and explicit collection mapping
module.exports = mongoose.model("CountryPetRegulation", CountryPetRegulationSchema, "country_regulations_list");
