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
        type: Map, // A Map to store task descriptions and their completion status
        of: Boolean, // Values are `true` for completed, `false` for not completed
        default: {}, // Initialize as an empty object
    },
});

const User = mongoose.model('User', userSchema);
module.exports = User;
