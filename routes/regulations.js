const express = require('express');
const router = express.Router();
const catchAsync = require('../utils/catchAsync');
const ExpressError = require('../utils/ExpressError');
const CountryRegulation = require('../models/countryRegulations');
const PetType = require('../models/PetType');
const Regulation = require('../models/regulation');
const mongoose = require('mongoose');
const { isLoggedIn } = require('../middleware');
const { saveCurrentUrl } = require('../middleware');

const getRegulations = async (originCountry, destinationCountry, petTypeName) => {
    try {
        console.log('Searching for regulations from:', originCountry, 'to:', destinationCountry, 'for pet type:', petTypeName);

        // Find the origin and destination countries in the database
        const origin = await CountryRegulation.findOne({ country: new RegExp(`^${originCountry}$`, 'i') });
        const destination = await CountryRegulation.findOne({ country: new RegExp(`^${destinationCountry}$`, 'i') });

        if (!origin || !destination) {
            console.error('Origin or destination country not found');
            throw new Error('Origin or destination country not found');
        }

        // Debugging the origin and destination countries
        console.log('Origin Country:', origin);
        console.log('Destination Country:', destination);
        console.log('Origin Country ID:', origin._id, 'Type:', typeof origin._id);
        console.log('Destination Country ID:', destination._id, 'Type:', typeof destination._id);

        // Find the ObjectId for the specified pet type name
        const petType = await PetType.findOne({ type: petTypeName.toLowerCase() });
        if (!petType) {
            console.error('Pet type not found');
            throw new Error('Pet type not found');
        }

        // Debugging the pet type
        console.log('Pet Type:', petType);
        console.log('Pet Type ID:', petType._id, 'Type:', typeof petType._id);

        // Fetch the regulations based on the selected origin, destination, and pet type ObjectId
        const regulations = await Regulation.find({
            originCountry: origin._id,
            destinationCountry: destination._id,
            petType: petType._id // Using the ObjectId of the pet type
        })
        .populate('originCountry')
        .populate('destinationCountry')
        .populate('petType');

        console.log('Regulations found:', regulations);
        return regulations;
    } catch (error) {
        console.error('Error fetching regulations:', error);
        throw error;
    }
};


router.get('/newSearch', catchAsync(async (req, res) => {
    try {
        const countries = await CountryRegulation.find().select('country');  // Removed '-_id' to ensure `_id` is fetched
        const petTypes = await PetType.find().select('type');
        
        // Log the fetched data to confirm
        console.log('Fetched Countries:', countries);
        console.log('Fetched Pet Types:', petTypes);

        res.render('regulations/newSearch', { countries, petTypes });
    } catch (e) {
        console.error(e);
        res.status(500).send('Error fetching countries');
    }
}));



router.get('/searchFlights', catchAsync((req, res) => {
    res.render('regulations/searchFlights'); // Correct view name
}));



router.post('/submitCountry',saveCurrentUrl, catchAsync(async (req, res) => {
    console.log('Form submission data:', req.body);

    let { originCountry, destinationCountry, petType } = req.body;

    // Check if the fields are not empty
    if (!originCountry || !destinationCountry || !petType) {
        console.error('One or more fields are empty:', { originCountry, destinationCountry, petType });
        return res.status(400).send('Please make sure to select all fields in the form.');
    }

    // Validate if values are ObjectIds
    if (!mongoose.Types.ObjectId.isValid(originCountry) || !mongoose.Types.ObjectId.isValid(destinationCountry) || !mongoose.Types.ObjectId.isValid(petType)) {
        console.error('One or more provided IDs are not valid ObjectIds:', { originCountry, destinationCountry, petType });
        return res.status(400).send('Invalid selection. Please try again.');
    }

    try {
        const regulations = await Regulation.find({
            originCountry: originCountry,
            destinationCountry: destinationCountry,
            petType: petType
        })
        .populate('originCountry')
        .populate('destinationCountry')
        .populate('petType');

        console.log('Regulations found:', regulations);

        if (regulations.length > 0) {
            res.render('regulations/show', { regulations, originCountry, destinationCountry, petType });
        } else {
            res.status(404).send('No regulations found for the selected countries and pet type.');
        }
    } catch (e) {
        console.error('Error fetching regulations:', e);
        res.status(500).send('Error fetching regulations.');
    }
}));






module.exports = router;
