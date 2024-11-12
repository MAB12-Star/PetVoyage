const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define the schema for pet types (e.g., cat, dog, other)
const petTypeSchema = new Schema({
    type: {
        type: String,
        enum: ['Cat', 'Dog', 'Other'],  // Restricting to specific pet types
        required: true
    }
});

module.exports = mongoose.model('PetType', petTypeSchema);
