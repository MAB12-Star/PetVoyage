// models/airline.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const airlineSchema = new Schema({
  airlineCode: { type: String, required: true, unique: true }, // IATA code
  petPolicyURL: { type: String },
  airlineURL: { type: String },
  microchip: { type: String, enum: ['yes', 'no'] },
  healthCertificate: { type: String, enum: ['yes', 'no'] },
  logo: { type: String },
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  body: { type: String },

  // Note: you do NOT need to require the Review model here
  reviews: [{ type: Schema.Types.ObjectId, ref: 'Review' }],
  author: { type: Schema.Types.ObjectId, ref: 'User' },

  PetPolicySummary: { type: String, default: "" },
  ImprovedPetPolicySummary: { type: String, default: "" },

  inCargo: { type: String, enum: ['yes', 'no'] },
  inCargoAnimals: {
    type: [String],
    enum: ['Cat', 'Dog', 'Bird', 'Reptile'],
    default: []
  },
  inCompartment: { type: String, enum: ['yes', 'no'] },
  inCompartmentAnimals: {
    type: [String],
    enum: ['Cat', 'Dog', 'Bird', 'Reptile'],
    default: []
  },
  dangerousBreeds: { type: String, enum: ['yes', 'no'] },
  brachycephalic: { type: String, enum: ['yes', 'no'] },
  serviceAnimals: { type: String, enum: ['yes', 'no'] },
  esAnimals: { type: String, enum: ['yes', 'no'] },
  petShipping: { type: String, enum: ['yes', 'no'] },

  dangerousBreedList: { type: String, default: "" },
  brachycephalicBreedList: { type: String, default: "" },
  inCompartmentDetails: { type: String, default: "" },
  inCargoDetails: { type: String, default: "" },
  serviceAnimalDetails: { type: String, default: "" },
  carrierCargoDetails: { type: String, default: "" },
  carrierCompartmentDetails: { type: String, default: "" },
  esaDetails: { type: String, default: "" },

  healthVaccinations: {
    type: [String],
    enum: [
      'Rabies',
      'Internal/External parasites',
      'Distemper',
      'Adenovirus',
      'Parvovirus',
      'Parainfluenza'
    ],
    default: []
  },
});

// Auto-slug (only if missing)
airlineSchema.pre('save', function(next) {
  if (this.name && !this.slug) {
    this.slug = this.name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '');
  }
  next();
});

// ✅ Singleton export to avoid OverwriteModelError
module.exports = mongoose.models.Airline || mongoose.model('Airline', airlineSchema);
