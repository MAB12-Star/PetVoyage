const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define the schema for regulations related to pets during travel
const regulationSchema = new Schema({
    link: {
        type: String,
        required: true  // URL or resource link for the regulation
    },

    description: {
        type: String,
        required: true  // Brief description or summary of the regulation
    },
    vaccinations:{
        type:String,
        required:true
    },
    certifications:{
        type:String,
        required:true
    },
    microchip:{
        type:String,
        required:true
    },
    assistancePet:{
        type:String,
        
    },
    petType: {
        type: Schema.Types.ObjectId,  // Links the regulation to a specific pet type
        ref: 'PetType',
        required: true
    },
    originCountry: {
        type: Schema.Types.ObjectId,  // Links the regulation to the origin country
        ref: 'CountryRegulation',
        required: true
    },
    destinationCountry: {
        type: Schema.Types.ObjectId,  // Links the regulation to the destination country
        ref: 'CountryRegulation',
        required: true
    },
    stateTerritoryRequirements:{
        type:String,
    }
});

// Export the model to use in other parts of the app
module.exports = mongoose.model('Regulation', regulationSchema);
