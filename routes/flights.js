const express = require('express');
const router = express.Router();
const axios = require('axios');
const Airport = require('../models/airlineRegulations');
const Flight = require('../models/flightSchema');
const Airline = require('../models/airline');
const { saveCurrentUrl } = require('../middleware');
const mongoose = require('mongoose');
const cheerio = require('cheerio');
const OpenAI = require("openai").default;
const FLIGHTLABS_API_KEY = process.env.FLIGHTLABS_API_KEY_ENV;
const openai = new OpenAI({
    apiKey: process.env.openaiKey
});

// Middleware to map airport names to IATA codes
const mapAirportToIATA = async (req, res, next) => {
    let { selectedAirportLat, selectedAirportLng, selectedDestinationLat, selectedDestinationLng } = req.body;
    selectedAirportLat = parseFloat(selectedAirportLat);
    selectedAirportLng = parseFloat(selectedAirportLng);
    selectedDestinationLat = parseFloat(selectedDestinationLat);
    selectedDestinationLng = parseFloat(selectedDestinationLng);

    //Log the received lat/lng values for debugging
   console.log('Selected Airport Latitude:', selectedAirportLat);
   console.log('Selected Airport Longitude:', selectedAirportLng);
   console.log('Selected Destination Latitude:', selectedDestinationLat);
   console.log('Selected Destination Longitude:', selectedDestinationLng);

    try {
        // Fetch the IATA code for the current location using lat/lng
        const originResponse = await axios.get(`http://www.iatageo.com/getCode/${selectedAirportLat}/${selectedAirportLng}`);
        const originCode = originResponse.data.IATA; // IATA code for origin

        // Log the origin code for debugging
     //   console.log('Fetched Origin IATA Code:', originCode);

        // Fetch the IATA code for the selected destination airport using lat/lng
        const destinationResponse = await axios.get(`http://www.iatageo.com/getCode/${selectedDestinationLat}/${selectedDestinationLng}`);
        const destinationCode = destinationResponse.data.IATA; // IATA code for destination

      //  console.log('Fetched Destination IATA Code:', destinationCode);

        // Store the IATA codes in the request body for further use
        req.body.originCode = originCode;
        req.body.destinationCode = destinationCode;

        // Log the request body to confirm the codes are stored correctly
     //   console.log('Request Body after IATA mapping:', req.body);

        next(); // Proceed to the next middleware or route handler
    } catch (error) {
        console.error('Error fetching IATA codes:', error);
        res.status(500).send('Error fetching IATA codes.');
    }
};


router.post('/searchFlights', saveCurrentUrl, mapAirportToIATA, async (req, res) => {
    const { originCode, destinationCode } = req.body;

    try {
        // Check if flight data is cached in the database
        let flightData = await Flight.findOne({ originCode, destinationCode });

        if (flightData) {
              req.session.currentPage = {
                searchId: flightData._id,
                originCode,
                destinationCode,
            };

            // Fetch airlines from the database to build the ID and pet policy maps
            const validAirlineCodes = flightData.airlineCodes.filter(Boolean).map((code) => code.trim().toUpperCase());
            const airlines = await Airline.find({ airlineCode: { $in: validAirlineCodes } });

            const petPolicyMap = {};
            const airlineIdMap = {};
            const airlineSlugMap = {};
            const microchipMap = {};
            const healthCertificateMap = {};
            const logo = {};
            const inCargoAnimals  = {};
            const inCompartmentAnimals  = {};
            const dangerousBreeds  = {};
            const brachycephalic  = {};
            const serviceAnimals  = {};
            const esAnimals  = {};
            const petShipping  = {};
            const healthVaccinations ={};
            const dangerousBreedList = {};
            const brachycephalicBreedList ={};

            airlines.forEach((airline) => {
                petPolicyMap[airline.airlineCode] = airline.petPolicyURL;
                airlineIdMap[airline.airlineCode] = airline._id;
                airlineSlugMap[airline.airlineCode] = airline.slug;
                microchipMap[airline.airlineCode] = airline.microchip; // Include microchip field
                healthCertificateMap[airline.airlineCode] = airline.healthCertificate;
                logo[airline.airlineCode] = airline.logo; 
                inCargoAnimals[airline.airlineCode] = airline.inCargoAnimals;
                inCompartmentAnimals[airline.airlineCode] = airline.inCompartmentAnimals;
                dangerousBreeds[airline.airlineCode] = airline.dangerousBreeds;
                brachycephalic[airline.airlineCode] = airline.brachycephalic;
                serviceAnimals[airline.airlineCode] = airline.serviceAnimals;
                esAnimals[airline.airlineCode] = airline.esAnimals;
                petShipping[airline.airlineCode] = airline.petShipping;
                healthVaccinations[airline.airlineCode]= airline.healthVaccinations;
                dangerousBreedList[airline.airlineCode]=airline.dangerousBreedList;
                brachycephalicBreedList[airline.airlineCode] = airline.brachycephalicBreedList;

            });

            return res.redirect(`/flights/${flightData._id}`);
        }

        // Initialize variables
        let airlineCodes = [];
        let flightTypeMap = {};
        

        // Fetch direct flights from FlightLabs API
        const directFlightsResponse = await axios.get('https://app.goflightlabs.com/routes', {
            params: {
                access_key: FLIGHTLABS_API_KEY,
                dep_iata: originCode,
                arr_iata: destinationCode,
                _fields: 'airline_iata,connection_count',
            },
        });

        if (directFlightsResponse.data?.data?.length > 0) {
            directFlightsResponse.data.data.forEach((route) => {
                const airlineCode = route.airline_iata;
                if (!airlineCodes.includes(airlineCode)) {
                    airlineCodes.push(airlineCode);
                    flightTypeMap[airlineCode] = 'direct';
                }
            });
        }

        // Fetch indirect flights (multi-leg routes)
        const firstLegResponse = await axios.get('https://app.goflightlabs.com/routes', {
            params: {
                access_key: FLIGHTLABS_API_KEY,
                dep_iata: originCode,
                _fields: 'airline_iata,arr_iata',
            },
        });

        if (firstLegResponse.data?.data?.length > 0) {
            const connectionAirports = [...new Set(firstLegResponse.data.data.map((route) => route.arr_iata))];

            const secondLegResponses = await Promise.all(
                connectionAirports.map(async (connectionAirport) => {
                    try {
                        return await axios.get('https://app.goflightlabs.com/routes', {
                            params: {
                                access_key: FLIGHTLABS_API_KEY,
                                dep_iata: connectionAirport,
                                arr_iata: destinationCode,
                                _fields: 'airline_iata',
                            },
                        });
                    } catch (error) {
                        console.error(`Error fetching second leg from ${connectionAirport}:`, error.message);
                        return null;
                    }
                })
            );

            secondLegResponses.forEach((response) => {
                if (response?.data?.data?.length > 0) {
                    response.data.data.forEach((route) => {
                        const airlineCode = route.airline_iata;
                        if (!airlineCodes.includes(airlineCode)) {
                            airlineCodes.push(airlineCode);
                            flightTypeMap[airlineCode] = 'indirect';
                        }
                    });
                }
            });
        }

        // Generate airline names using OpenAI
        const airlineNamesMap = {};
        if (airlineCodes.length > 0) {
            try {
                const prompt = `Translate the following IATA airline codes to their respective airline names: ${airlineCodes.join(
                    ', '
                )}. Please provide each translation on a new line in the format "IATA Code: Airline Name".`;

                const response = await openai.chat.completions.create({
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: prompt }],
                });

                const airlinesInfo = response.choices[0].message.content.trim().split('\n');
                airlinesInfo.forEach((line) => {
                    const [iataCode, name] = line.split(':').map((item) => item.trim());
                    if (iataCode && name) {
                        airlineNamesMap[iataCode] = name;
                    }
                });
            } catch (error) {
                console.error('Error fetching airline data from OpenAI:', error.message);
            }
        }

        // Fetch airline data from the database
        const airlines = await Airline.find({ airlineCode: { $in: airlineCodes } });
        const petPolicyMap = {};
        const airlineIdMap = {};
        const airlineSlugMap = {};
        const microchipMap = {};
        const healthCertificateMap = {};
        const logo = {};
        const inCargoAnimals  = {};
        const inCompartmentAnimals  = {};
        const dangerousBreeds  = {};
        const brachycephalic  = {};
        const serviceAnimals  = {};
        const esAnimals  = {};
        const petShipping  = {};
        const healthVaccinations ={};
        const dangerousBreedList = {};
        const brachycephalicBreedList = {};
    
        airlines.forEach((airline) => {
            petPolicyMap[airline.airlineCode] = airline.petPolicyURL;
            airlineIdMap[airline.airlineCode] = airline._id;
            airlineSlugMap[airline.airlineCode] = airline.slug;
            microchipMap[airline.airlineCode] = airline.microchip; // Include microchip field
            healthCertificateMap[airline.airlineCode] = airline.healthCertificate;
            logo[airline.airlineCode] = airline.logo; 
            inCargoAnimals[airline.airlineCode] = airline.inCargoAnimals;
            inCompartmentAnimals[airline.airlineCode] = airline.inCompartmentAnimals;
            dangerousBreeds[airline.airlineCode] = airline.dangerousBreeds;
            brachycephalic[airline.airlineCode] = airline.brachycephalic;
            serviceAnimals[airline.airlineCode] = airline.serviceAnimals;
            esAnimals[airline.airlineCode] = airline.esAnimals;
            petShipping[airline.airlineCode] = airline.petShipping;
            healthVaccinations[airline.airlineCode]= airline.healthVaccinations;
            dangerousBreedList[airline.airlineCode]=airline.dangerousBreedList;
            brachycephalicBreedList[airline.airlineCode]= airline.brachycephalicBreedList;

        });

        // Save flight data to the database
        flightData = new Flight({
            originCode,
            destinationCode,
            airlineCodes,
            airlineNamesMap,
            flightTypeMap,
            
        });
        await flightData.save();

        // Render the flights page
        res.redirect(`/flights/${flightData._id}`);
    } catch (error) {
        console.error('Error fetching flight data:', error.message);
        if (!res.headersSent) {
            res.status(500).send('Error fetching flight data.');
        }
    }
});

router.get('/:searchId', async (req, res) => {
    const { searchId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(searchId)) {
        return res.status(400).send('Invalid search ID');
    }

    try {
        const flightData = await Flight.findById(searchId);

        if (!flightData) {
            return res.status(404).send('Search results not found');
        }

        // Fetch airline data
        const validAirlineCodes = flightData.airlineCodes.filter(Boolean).map((code) => code.trim().toUpperCase());
        const airlines = await Airline.find({ airlineCode: { $in: validAirlineCodes } });

        const petPolicyMap = {};
        const airlineIdMap = {};
        const airlineSlugMap = {};
        const microchipMap = {};
        const healthCertificateMap = {};
        const logo = {};
        const inCargoAnimals  = {};
        const inCompartmentAnimals  = {};
        const dangerousBreeds  = {};
        const brachycephalic  = {};
        const serviceAnimals  = {};
        const esAnimals  = {};
        const petShipping  = {};
        const healthVaccinations ={};
        const dangerousBreedList = {};
        const brachycephalicBreedList = {}
    
        airlines.forEach((airline) => {
            petPolicyMap[airline.airlineCode] = airline.petPolicyURL;
            airlineIdMap[airline.airlineCode] = airline._id;
            airlineSlugMap[airline.airlineCode] = airline.slug;
            microchipMap[airline.airlineCode] = airline.microchip; // Include microchip field
            healthCertificateMap[airline.airlineCode] = airline.healthCertificate; 
            logo[airline.airlineCode] = airline.logo; 
            inCargoAnimals[airline.airlineCode] = airline.inCargoAnimals;
            inCompartmentAnimals[airline.airlineCode] = airline.inCompartmentAnimals;
            dangerousBreeds[airline.airlineCode] = airline.dangerousBreeds;
            brachycephalic[airline.airlineCode] = airline.brachycephalic;
            serviceAnimals[airline.airlineCode] = airline.serviceAnimals;
            esAnimals[airline.airlineCode] = airline.esAnimals;
            petShipping[airline.airlineCode] = airline.petShipping;
            healthVaccinations[airline.airlineCode] = airline.healthVaccinations;
            dangerousBreedList[airline.airlineCode]=airline.dangerousBreedList;
            brachycephalicBreedList[airline.airlineCode]= airline.brachycephalicBreedList;
        });

        // Render the flights result page
        res.render('regulations/showFlights', {
            flights: flightData.airlineCodes,
            airlineNamesMap: flightData.airlineNamesMap,
            flightTypeMap: flightData.flightTypeMap,
            petPolicyMap,
            airlineIdMap,
            airlineSlugMap,
            microchipMap,
            healthCertificateMap,
            logo,
            inCargoAnimals,
            inCompartmentAnimals,
            dangerousBreeds,
            brachycephalic,
            serviceAnimals,
            esAnimals,
            petShipping,
            healthVaccinations,
            dangerousBreedList,
            brachycephalicBreedList,
        });
    } catch (error) {
        console.error('Error fetching flight data:', error.message);
        res.status(500).send('Error fetching flight data.');
    }
});


const { generateAirlineNamesMap } = require('../helpers/airlineUtils');



// Route to fetch and display airline information
// router.get('/:id', async (req, res, next) => {
//     try {
//         // Fetch the airline by ID from the database
//         const airline = await Airline.findById(req.params.id).populate({
//             path: 'reviews',
//             populate: { path: 'author' },
//         });

//         console.log('Airline Data:', airline);

//         // Render the airline page without web scraping or ChatGPT
//         if (airline) {
//             res.render('regulations/showAirline', {
//                 airline,
//                 petPolicySummary: airline.petPolicySummary || 'No pet policy summary available.',
//             });
//         } else {
//             res.status(404).send('Airline not found.');
//         }
//     } catch (error) {
//         console.error('Error fetching airline data:', error);
//         next(error);
//     }
// });

// // GET Route to Retrieve Flights using FlightLabs API
// router.get('/flights', async (req, res) => {
//     try {
//         const { origin, destination } = req.query;

//         // If there is origin and destination in the query, use them
//         if (origin && destination) {
//             console.log('Reconstructing search from saved criteria:', { origin, destination });

//             // Set up your logic to get the flights again based on the saved criteria
//             const flights = await getFlightsFromCriteria(origin, destination);

//             // Extract airline codes from the flights
//             const airlineCodes = flights.flatMap(flight =>
//                 flight.itineraries.flatMap(itinerary =>
//                     itinerary.segments.map(segment => segment.carrierCode)
//                 )
//             );

//             const uniqueAirlineCodes = [...new Set(airlineCodes)];
//             const regulations = await Airport.find({ airlineCode: { $in: uniqueAirlineCodes } });

//             // Map regulations for easier access
//             const regulationMap = regulations.reduce((acc, regulation) => {
//                 acc[regulation.airlineCode] = regulation;
//                 return acc;
//             }, {});

//             res.render('flights', { flights, regulationMap });
//             return;
//         }

//         // Default rendering if no origin/destination
//         res.render('flights', { flights: [], regulationMap: {} });
//     } catch (error) {
//         console.error('Error retrieving flights:', error.message);
//         res.status(500).send('Error retrieving flights.');
//     }
// });










// GET Route to Retrieve Flights using FlightLabs API
router.get('/flights', async (req, res) => {
    try {
        const { origin, destination } = req.query;

        // If there is origin and destination in the query, use them
        if (origin && destination) {
          

            // Set up your logic to get the flights again based on the saved criteria
            const flights = await getFlightsFromCriteria(origin, destination);

            // Extract airline codes from the flights
            const airlineCodes = flights.flatMap(flight =>
                flight.itineraries.flatMap(itinerary =>
                    itinerary.segments.map(segment => segment.carrierCode)
                )
            );

            const uniqueAirlineCodes = [...new Set(airlineCodes)];
            const regulations = await Airport.find({ airlineCode: { $in: uniqueAirlineCodes } });

            // Map regulations for easier access
            const regulationMap = regulations.reduce((acc, regulation) => {
                acc[regulation.airlineCode] = regulation;
                return acc;
            }, {});

            res.render('flights', { flights, regulationMap });
            return;
        }

        // Default rendering if no origin/destination
        res.render('flights', { flights: [], regulationMap: {} });
    } catch (error) {
        console.error('Error retrieving flights:', error.message);
        res.status(500).send('Error retrieving flights.');
    }
});



module.exports = router;
