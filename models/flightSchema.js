const mongoose = require('mongoose');

// Define the schema for storing flight data (moved to models folder)
const flightSchema = new mongoose.Schema({
    originCode: String,
    destinationCode: String,
    airlineCodes: [String],
    airlineNamesMap: Object,
    flightTypeMap: Object,
    createdAt: { type: Date, default: Date.now, expires: '30d' } // Set TTL index to expire after 24 hours
});

module.exports = mongoose.model('Flight', flightSchema);