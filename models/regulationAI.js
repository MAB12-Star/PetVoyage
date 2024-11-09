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
    }
});

s

// Export the model to use in other parts of the app
module.exports = mongoose.model('Regulation', regulationSchema);

// const mongoose = require('mongoose');
// const Schema = mongoose.Schema;

// const regulationSchema = new Schema({
//     country: {
//         type: String,
//         required: true,
//     },
//     petType: {
//         type: String,
//         required: true,
//     },
//     content: {
//         type: String,
//         required: true,
//     },
//     dateAdded: {
//         type: Date,
//         default: Date.now,
//     },
// });

// const Regulation = mongoose.model('Regulation', regulationSchema);
// module.exports = Regulation;
