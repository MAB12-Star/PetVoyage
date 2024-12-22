const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new mongoose.Schema({
    googleId: {
        type: String,
        required: true,
        unique: true,
    },
    displayName: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    savedRegulations: [
        {
            type: Schema.Types.ObjectId,
            ref: 'Regulation',
        },
    ],
    savedFlightRegulations: [
        {
            type: Schema.Types.ObjectId,
            ref: 'Airline',
        },
    ],
    toDoList: {
        type: Map,
        of: [String],  // Change from Array to Array of Strings
        default: {
            "To-Do": [ "Research your destination country's pet import requirements",
                "Get your pet's crate or carrier and start working on acclimation",
                "Schedule a visit to see your veterinarian",
                "Check airline or roadway routes",
                "Research pet-friendly hotels and services",
                "Get your pet's supplies",
                "Schedule a trip to the groomer",],
            "in-progress": [],
            "completed": [],
        },
    },
});

const User = mongoose.model('User', userSchema);
module.exports = User;
