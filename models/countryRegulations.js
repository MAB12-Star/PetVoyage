const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define the schema for a country and its related pet types
const countryRegulationSchema = new Schema({
    country: {
        type: String,
        enum: [
            'United States',
            'Canada',
            'Mexico',
          
            // Add more countries as needed
        ],
        required: true
    },
    petTypes: [
        {
            type: Schema.Types.ObjectId,
            ref: 'PetType'  // Referencing the PetType model
        }
    ]
});

module.exports = mongoose.model('CountryRegulation', countryRegulationSchema);
