// models/review.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const reviewSchema = new Schema(
  {
    body:   { type: String, required: true, trim: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    originCountry: { type: String },
    destinationCountry: { type: String, index: true },
    petType: { type: String, enum: ['Dog', 'Cat', 'Dog and cat', 'Bird', 'Other pet'] },
    travelMode: { type: String, enum: ['Cabin', 'Checked hold', 'Cargo'] },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // IMPORTANT: make sure every review knows which airline it belongs to
    airline:{ type: Schema.Types.ObjectId, ref: 'Airline', required: true },
  },
  { timestamps: true }
);

reviewSchema.index({ airline: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
