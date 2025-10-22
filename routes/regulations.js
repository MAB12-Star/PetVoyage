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

  

        // Find the ObjectId for the specified pet type name
        const petType = await PetType.findOne({ type: petTypeName.toLowerCase() });
        if (!petType) {
            console.error('Pet type not found');
            throw new Error('Pet type not found');
        }


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
        // Fetch countries and their names
        const countries = await CountryRegulation.find().select('country');
        const petTypes = await PetType.find().select('type');

        console.log('Fetched Countries:', countries);
        console.log('Fetched Pet Types:', petTypes);

        // Render the form with the country and pet type names
        res.render('regulations/newSearch', { countries, petTypes, destinationCountry: '', petType: '' });
    } catch (e) {
        console.error(e);
        res.status(500).send('Error fetching countries');
    }
}));



router.get('/submitCountry/:originCountry/:destinationCountry/:petType/Pet/Policy', saveCurrentUrl, catchAsync(async (req, res) => {
    const { originCountry, destinationCountry, petType } = req.params; // Extract parameters from the URL

    // Validate input
    if (!originCountry || !destinationCountry || !petType) {
        return res.status(400).send('Please make sure to select all fields.');
    }

    try {
        // Fetch the destination country ObjectId using the country name
        const destinationCountryObj = await CountryRegulation.findOne({ country: destinationCountry });

        if (!destinationCountryObj) {
            return res.status(404).send('Destination country not found.');
        }

        // Fetch the origin country ObjectId using the originCountry parameter
        const originCountryObj = await CountryRegulation.findOne({ country: originCountry });

        if (!originCountryObj) {
            return res.status(404).send('Origin country not found.');
        }

        // Fetch the pet type ObjectId using the petType parameter
        const petTypeObj = await PetType.findOne({ type: petType });

        if (!petTypeObj) {
            return res.status(404).send('Pet type not found.');
        }

        // Fetch the regulations based on the ObjectIds of originCountry, destinationCountry, and petType
        const regulations = await Regulation.find({
            originCountry: originCountryObj._id,
            destinationCountry: destinationCountryObj._id,
            petType: petTypeObj._id
        })
        .populate('originCountry')
        .populate('destinationCountry')
        .populate('petType');

        // Render the page with the appropriate data
        if (regulations.length > 0) {
            const origin = originCountryObj.country;
            const destination = destinationCountryObj.country;
            const pageTitle = `Pet Travel from ${origin} to ${destination} for ${petType}`;
            const description = `Find official pet travel requirements when flying with your ${petType} from ${origin} to ${destination}. Covers documents, crate rules, vaccinations, and airline restrictions.`;
        
            res.render('regulations/show', {
                regulations,
                destinationCountry: destination,
                originCountry: origin,
                petType,
                title: pageTitle,
                metaDescription: description,
                metaKeywords: `pet travel ${origin} to ${destination}, ${petType} travel rules, ${destination} pet entry, pet documents, international travel for pets`,
                ogTitle: pageTitle,
                ogDescription: description,
                ogUrl: `https://www.petvoyage.ai/submitCountry/${origin}/${destination}/${petType}/Pet/Policy`,
                ogImage: '/images/pet-travel-cover.jpg',
                twitterTitle: pageTitle,
                twitterDescription: description,
                twitterImage: '/images/pet-travel-cover.jpg'
            });
        } else {
            res.status(404).send('No regulations found for the selected countries and pet type.');
        }
        
    } catch (e) {
        console.error(e);
        res.status(500).send('Error fetching regulations.');
    }
}));



router.post('/submitCountry/:orginCountry/:destinationCountry/:petType/Pet/Policy', saveCurrentUrl, catchAsync(async (req, res) => {
    const { originCountry } = req.body;
    const { destinationCountry, petType } = req.params;  // Capture destinationCountry and petType from URL

    // Validate input
    if (!originCountry || !destinationCountry || !petType) {
        return res.status(400).send('Please make sure to select all fields.');
    }

    try {
        // Fetch the destination country ObjectId using the country name from the URL
        const destinationCountryObj = await CountryRegulation.findOne({ country: destinationCountry });

        // Ensure that a valid destination country was found
        if (!destinationCountryObj) {
            return res.status(404).send('Destination country not found.');
        }

        // Fetch the origin country ObjectId using the country name from the form body
        const originCountryObj = await CountryRegulation.findOne({ country: originCountry });

        // Ensure that a valid origin country was found
        if (!originCountryObj) {
            return res.status(404).send('Origin country not found.');
        }

        // Fetch the pet type ObjectId using the pet type from the URL
        const petTypeObj = await PetType.findOne({ type: petType });

        // Ensure that a valid pet type was found
        if (!petTypeObj) {
            return res.status(404).send('Pet type not found.');
        }

        // Fetch the regulations based on the ObjectIds of originCountry, destinationCountry, and petType
        const regulations = await Regulation.find({
            originCountry: originCountryObj._id,
            destinationCountry: destinationCountryObj._id,
            petType: petTypeObj._id // Using the ObjectId of the pet type
        })
        .populate('originCountry')
        .populate('destinationCountry')
        .populate('petType');

        // Render the page with the appropriate data
        if (regulations.length > 0) {
            res.render('regulations/show', { regulations, destinationCountry, originCountry, petType });
        } else {
            res.status(404).send('No regulations found for the selected countries and pet type.');
        }
    } catch (e) {
        console.error(e);
        res.status(500).send('Error fetching regulations.');
    }
}));








module.exports = router;
