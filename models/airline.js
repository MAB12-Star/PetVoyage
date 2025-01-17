const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Review = require('./review');

// Define the schema for storing airline data
const airlineSchema = new mongoose.Schema({
    airlineCode: { type: String, required: true, unique: true }, // IATA code of the airline
    petPolicyURL: { type: String, required: false },             // URL to the airline's pet policy page
    airlineURL: { type: String },                                // Main airline website
    name: { type: String, required: true },                      // Airline name
    slug: { type: String, required: true, unique: true },         // Slug for URL-friendly names
    body: { type: String },                                      // Placeholder body text
    reviews: [
        {
            type: Schema.Types.ObjectId,
            ref: 'Review'                                        // Reference to reviews
        }
    ],
    author: {
        type: Schema.Types.ObjectId,
        ref: 'User'                                              // Reference to author
    },
    PetPolicySummary: { type: String, default: "" },             // Summary of the pet policy
    ImprovedPetPolicySummary: { type: String, default: "" }      // Improved/HTML formatted pet policy summary
});

// Create a pre-save hook to generate the slug before saving the document
airlineSchema.pre('save', function(next) {
    // Generate the slug by converting the name to lowercase and replacing spaces with hyphens
    if (this.name) {
        this.slug = this.name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '');
    }
    next();
});

module.exports = mongoose.model('Airline', airlineSchema);
