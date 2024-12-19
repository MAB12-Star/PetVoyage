const mongoose = require('mongoose');
const Review = require('./models/review');
const Airline = require('./models/airline');
require('dotenv').config(); // Load environment variables

// Replace with the ObjectId of an admin or system account
const defaultAuthorId = '64a5b5a8f73b2520d2d62df5';

const updateAirlines = async () => {
    try {
        const airlines = await Airline.find({});
        for (const airline of airlines) {
            airline.reviews = airline.reviews || [];
            airline.author = airline.author || defaultAuthorId; // Set to default if null
            await airline.save();
        }
        console.log('Airlines updated with default authors.');
    } catch (error) {
        console.error('Error updating airlines:', error);
    } finally {
        mongoose.connection.close();
    }
};

mongoose.connect(process.env.mongoKey, { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error'));
db.once('open', () => {
    console.log('Database Connected');
    updateAirlines(); // Call the function after the connection is open
});
