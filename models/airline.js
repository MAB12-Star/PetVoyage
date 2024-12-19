// models/Airline.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Review = require('./review');
// Define the schema for storing airline data
const airlineSchema = new mongoose.Schema({
    airlineCode: { type: String, required: true, unique: true }, // IATA code of the airline
    petPolicyURL: { type: String, required: false },
    airlineURL:{type:String},
    name: { type: String, required: true },
    body:{type: String},
    reviews: [
        {
            type: Schema.Types.ObjectId,
            ref: 'Review'
        }
    ],
    author: 
        {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },            // URL to the airline's pet policy page
});

module.exports = mongoose.model('Airline', airlineSchema);