const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
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
        { type: Schema.Types.ObjectId, ref: 'Regulation' }
    ],
    savedFlightRegulations: [
        { type: Schema.Types.ObjectId, ref: 'Airline' }
    ],
    toDoList: {
        type: Object,
        default: {}, // Will store the nested checklist as key-value pairs
    },
});

const User = mongoose.model('User', userSchema);
module.exports = User;
