// models/airport.js
const mongoose = require('mongoose');

const airportSchema = new mongoose.Schema({
    iataCode: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    location: {
        type: String,
        required: true
    },
    DogRegulation:{
        type: String,
        required: true,
    },
    CatRegulation:{
        type: String,
        required: true,
    },
    OtherRegulation:{
        type: String,
        required: true,
    },
    WebSite:{
        type: String,
        required: true,
    },
    airlineCode: { // Add this line
        type: String, 
        required: true
    }
});

const Airport = mongoose.model('Airport', airportSchema);

module.exports = Airport;
