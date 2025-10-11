// models/review.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const reviewSchema = new Schema({
  body:   { type: String, required: true },
  rating: { type: Number, min: 0, max: 5, default: 0 },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  airline:{ type: Schema.Types.ObjectId, ref: 'Airline', required: true }, // <-- ensure present
}, { timestamps: true }); // createdAt/updatedAt for UI

module.exports = mongoose.model('Review', reviewSchema);
