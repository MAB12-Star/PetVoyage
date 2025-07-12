const express = require('express');
const router = express.Router();
const Airline = require('../models/airline');

router.get('/', async (req, res) => {
    try {
        const airlines = await Airline.find({});

        res.render('regulations/airlineList', {
            airlines,
            title: 'Airlines That Accept Pets | PetVoyage',
            metaDescription: 'Browse airlines with pet travel options. Compare airline pet policies for in-cabin, cargo, and service animals.',
            metaKeywords: 'airline pet policy, fly with pets, pet cargo rules, in-cabin pets, service animal travel, ESA travel',
            ogUrl: 'https://www.petvoyage.ai/regulations/airlineList',
            ogImage: 'https://www.petvoyage.ai/images/Logo.png', // replace with your actual image path
            twitterTitle: 'Airline Pet Travel Rules | PetVoyage',
            twitterDescription: 'See which airlines allow pets in cabin, cargo, or as service animals. Get your pet ready for takeoff!'
        });

    } catch (error) {
        console.error("Error loading airline list:", error);
        res.status(500).send("Error loading airlines");
    }
});


module.exports = router;

