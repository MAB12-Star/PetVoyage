const express = require('express');
const router = express.Router();
const Airline = require('../models/airline'); // Import the correct Airline model

// Route to fetch all airlines (names only)
router.get('/airlines', async (req, res) => {
    try {
        const airlines = await Airline.find({}, 'name _id slug'); // Fetch name, _id, and slug
        res.json(airlines); // Return as JSON
    } catch (error) {
        console.error("Error fetching airlines:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

// Route to fetch airline details by slug
router.get('/airlines/:slug', async (req, res) => {
    try {
        const slug = req.params.slug; // Get the slug from the route
        const airline = await Airline.findOne({ slug }).populate('reviews').exec(); // Find by slug

        if (airline) {
            const link = `${req.protocol}://${req.get('host')}/airlines/${airline.slug}`; // Dynamically generate link using slug
            res.render('regulations/showAirline', {
                airline,
                link, // Pass the dynamic link to the template
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
