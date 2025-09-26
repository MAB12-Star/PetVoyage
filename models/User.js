// models/User.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/** Sub-doc: saved itineraries shown on the user's dashboard */
const SavedItinerarySchema = new Schema({
  airlineId:    { type: Schema.Types.ObjectId, ref: 'Airline' },
  airlineName:  String,
  airlineCode:  String,
  airlineSlug:  String,
  petPolicyURL: String,
  country:      String,
  petType:      String,
  html:         String,  // server-rendered itinerary HTML
  hash:         String,  // for dedupe (airline+country+petType)
  createdAt:    { type: Date, default: Date.now }
}, { _id: true });

const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  displayName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  savedItineraries: { type: [SavedItinerarySchema], default: [] },
  // NEW
  role: {
    type: String,
    enum: ['user', 'vendor', 'admin'],
    default: 'user'
  },

  savedRegulations: [{ type: Schema.Types.ObjectId, ref: 'Regulation' }],
  savedFlightRegulations: [{ type: Schema.Types.ObjectId, ref: 'Airline' }],
  favoriteAirlines: [{
    airlineId: { type: Schema.Types.ObjectId, ref: 'Airline' },
    link: String,
    airlineCode: String,
    airlineName: String,
    petPolicyURL: String,
    petPolicySummary: String,
    slug: String,
  }],

 

  toDoList: {
    type: Map,
    of: [String],
    default: {
      "To-Do": [
        "Research your destination country's pet import requirements",
        "Get your pet's crate or carrier and start working on acclimation",
        "Schedule a visit to see your veterinarian",
        "Check airline or roadway routes",
        "Research pet-friendly hotels and services",
        "Get your pet's supplies",
        "Schedule a trip to the groomer",
        "Check airline or roadway routes",
        "Research Pet Friendly Hotels and Services",
        "Get your pet's supplies"
      ],
      "in-progress": [],
      "completed": [],
    },
  },
}, { timestamps: true });



module.exports = mongoose.model('User', userSchema);
