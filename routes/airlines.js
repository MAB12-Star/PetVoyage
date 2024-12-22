const express = require('express');
const router = express.Router();
const Airline = require('../models/airline'); // Import the correct Airline model

router.get('/airlines', async (req, res) => {
    try {
        const airlines = await Airline.find({}, 'name _id'); // Fetch name and _id
        res.json(airlines); // Return as JSON
    } catch (error) {
        console.error("Error fetching airlines:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

// Route to fetch airline details by ID
router.get('/flights/:id', async (req, res) => {
    try {
        const flightId = req.params.id;
        const airline = await Airline.findById(flightId).populate('reviews').exec();

        if (airline) {
            res.render('regulations/showAirline', {
                airline,
                ImprovedPetPolicySummary: airline.ImprovedPetPolicySummary || 'No pet policy summary available.',
            });
        } else {
            res.status(404).send("Airline not found.");
        }
    } catch (error) {
        console.error("Error fetching airline:", error);
        res.status(500).send("Server Error");
    }
});



module.exports = router;
