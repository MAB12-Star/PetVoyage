const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * Normalize Yes/No before saving
 */
function normalizeYesNo(v) {
  if (typeof v !== "string") return v;
  return v.trim().toLowerCase();
}

const airlineSchema = new mongoose.Schema({
  airlineCode: { type: String, required: true, unique: true },

  petPolicyURL: { type: String, default: "" },
  airlineURL: { type: String, default: "" },

  logo: { type: String },

  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },

  body: { type: String },

  reviews: [
    {
      type: Schema.Types.ObjectId,
      ref: "Review",
    },
  ],

  author: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },

  PetPolicySummary: { type: String, default: "" },
  ImprovedPetPolicySummary: { type: String, default: "" },

  microchip: {
    type: String,
    enum: ["yes", "no"],
    default: "no",
    set: normalizeYesNo,
  },

  healthCertificate: {
    type: String,
    enum: ["yes", "no"],
    default: "no",
    set: normalizeYesNo,
  },

  inCompartment: {
    type: String,
    enum: ["yes", "no"],
    default: "no",
    set: normalizeYesNo,
  },

  inCompartmentAnimals: {
    type: [String],
    default: [],
  },

  inCompartmentDetails: {
    type: String,
    default: "",
  },

  inCargo: {
    type: String,
    enum: ["yes", "no"],
    default: "no",
    set: normalizeYesNo,
  },

  inCargoAnimals: {
    type: [String],
    default: [],
  },

  inCargoDetails: {
    type: String,
    default: "",
  },

  carrierCompartmentDetails: {
    type: String,
    default: "",
  },

  carrierCargoDetails: {
    type: String,
    default: "",
  },

  dangerousBreeds: {
    type: String,
    enum: ["yes", "no"],
    default: "no",
    set: normalizeYesNo,
  },

  dangerousBreedList: {
    type: String,
    default: "",
  },

  brachycephalic: {
    type: String,
    enum: ["yes", "no"],
    default: "no",
    set: normalizeYesNo,
  },

  brachycephalicBreedList: {
    type: String,
    default: "",
  },

  serviceAnimals: {
    type: String,
    enum: ["yes", "no"],
    default: "no",
    set: normalizeYesNo,
  },

  serviceAnimalDetails: {
    type: String,
    default: "",
  },

  esAnimals: {
    type: String,
    enum: ["yes", "no"],
    default: "no",
    set: normalizeYesNo,
  },

  esaDetails: {
    type: String,
    default: "",
  },

  petShipping: {
    type: String,
    enum: ["yes", "no"],
    default: "no",
    set: normalizeYesNo,
  },

  healthVaccinations: {
    type: [String],
    default: [],
  },
});

/**
 * Slug generation
 */
airlineSchema.pre("save", function (next) {
  if (this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "");
  }
  next();
});

module.exports = mongoose.model("Airline", airlineSchema);
