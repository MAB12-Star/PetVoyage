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
            "To-Do": [],
            "In Progress": [],
            "Completed": [],
        },
    },
});

const User = mongoose.model('User', userSchema);
module.exports = User;
