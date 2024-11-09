const mongoose = require('mongoose');
const Schema = mongoose.Schema; // Don't forget to define the Schema

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
        { type: Schema.Types.ObjectId, 
           ref: 'Regulation' 
        }
    ],
    savedFlightRegulations: [
        { type: Schema.Types.ObjectId, 
           ref: 'Airline' 
        }
    ], // Array to store saved regulations
});



const User = mongoose.model('User', userSchema);

module.exports = User;

