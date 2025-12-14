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

/** Sub-doc: uploaded documents (e.g., rabies certificate) */
const UploadedDocSchema = new Schema({
  name: String,
  url: String,               // file path or Cloudinary/S3 URL
  uploadedAt: { type: Date, default: Date.now },
}, { _id: true });

const userSchema = new mongoose.Schema({
  googleId: { type: String, unique: true, sparse: true },
  facebookId: { type: String, unique: true, sparse: true },

  displayName: { type: String, required: true },
  email: { type: String, required: true, unique: true },

  savedItineraries: { type: [SavedItinerarySchema], default: [] },

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

  uploadedDocs: { type: [UploadedDocSchema], default: [] },

  toDoList: {
    type: Map,
    of: [String],
    default: {
      "To-Do": [],
      "in-progress": [],
      "completed": [],
    },
  },
}, { timestamps: true });




module.exports = mongoose.model('User', userSchema);
