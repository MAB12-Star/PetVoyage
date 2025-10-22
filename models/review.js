// models/review.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const reviewSchema = new Schema(
  {
    body:   { type: String, required: true, trim: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // IMPORTANT: make sure every review knows which airline it belongs to
    airline:{ type: Schema.Types.ObjectId, ref: 'Airline', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Review', reviewSchema);
