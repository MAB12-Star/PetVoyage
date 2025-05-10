const express = require('express');
const router = express.Router();
const Airline = require('../models/airline');

router.get('/', async (req, res) => {
    try {
        const airlines = await Airline.find({});
        res.render('regulations/airlineList', { airlines });
    } catch (error) {
        console.error("Error loading airline list:", error);
        res.status(500).send("Error loading airlines");
    }
});

module.exports = router;

