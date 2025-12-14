const mongoose = require('mongoose');

const AdSchema = new mongoose.Schema({
  title: { type: String, required: true },
  adType: { type: String, enum: ['image', 'html', 'script'], required: true },
  placements: {
  type: [String],
  required: true,
  enum: ['header','sidebar','inline-grid-2','inline-grid-6','footer','custom-spot']
},
linkUrl: { type: String },
imageUrl: { type: String },
productEmbed: { type: String },   // For shopify/affiliate scripts
content: { type: String },        // HTML embed
pages: { type: [String], default: ['*'] },
active: { type: Boolean, default: true },

}, { timestamps: true });

module.exports = mongoose.model('Ad', AdSchema);
