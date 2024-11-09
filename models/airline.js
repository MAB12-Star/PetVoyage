// models/Airline.js
const mongoose = require('mongoose');

// Define the schema for storing airline data
const airlineSchema = new mongoose.Schema({
    airlineCode: { type: String, required: true, unique: true }, // IATA code of the airline
    petPolicyURL: { type: String, required: false }              // URL to the airline's pet policy page
});

module.exports = mongoose.model('Airline', airlineSchema);