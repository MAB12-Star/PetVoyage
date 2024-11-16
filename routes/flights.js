const express = require('express');
const router = express.Router();
const axios = require('axios');
const Airport = require('../models/airlineRegulations');
const Flight = require('../models/flightSchema');
const Airline = require('../models/airline');
const { saveCurrentUrl } = require('../middleware');


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
  //  console.log('Selected Airport Latitude:', selectedAirportLat);
  //  console.log('Selected Airport Longitude:', selectedAirportLng);
  //  console.log('Selected Destination Latitude:', selectedDestinationLat);
  //  console.log('Selected Destination Longitude:', selectedDestinationLng);

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


router.post('/searchFlights',saveCurrentUrl, mapAirportToIATA, async (req, res) => {
   // console.log('Received POST request data:', req.body);
    const { originCode, destinationCode } = req.body;


    try {
         // Check if the flight data is already in the database
         let flightData = await Flight.findOne({ originCode, destinationCode });
     //    console.log('Flight Data:', flightData); // Log flight data to verify it's fetched correctly
 
         if (flightData) {
             // Use airlineCodes directly from flightData
             const validAirlineCodes = flightData.airlineCodes
                 .filter(code => code !== null && code !== undefined)
                 .map(code => code.trim().toUpperCase());
             
           //  console.log('Formatted Valid Airline Codes for Query:', validAirlineCodes);
             const allAirlines = await Airline.find({}); // Updated from Airline to Airlines
            // console.log('All Airlines in DB:', allAirlines.map(airline => airline.airlineCode)); // Corrected variable name reference
             
             // Fetch airline data to include pet policy URLs
             const airlines = await Airline.find({ airlineCode: { $in: validAirlineCodes } }); // Updated from Airline to Airlines
             
           //  console.log('Airline Documents Fetched:', airlines); // Log the fetched airline documents
             
 
             // Construct the pet policy map
             const petPolicyMap = {};
             airlines.forEach(airline => {
                 petPolicyMap[airline.airlineCode] = airline.petPolicyURL;
             });

             const flightTypeMap = flightData.flightTypeMap || {};
 
             // Log to confirm what is being passed to the EJS template
           //  console.log('Constructed Pet Policy Map:', petPolicyMap);
            res.render('regulations/showFlights', {
                flights: flightData.airlineCodes,
                airlineNamesMap: flightData.airlineNamesMap,
                flightTypeMap,
                petPolicyMap
            });
            return;
        }

        let airlineCodes = [];
        let flightTypeMap = {};

        // Fetch direct flights from FlightLabs API
       // console.log('Fetching direct flights...');
        const directFlightsResponse = await axios.get('https://app.goflightlabs.com/routes', {
            params: {
                access_key: FLIGHTLABS_API_KEY,
                dep_iata: originCode,
                arr_iata: destinationCode,
                _fields: 'airline_iata,connection_count'
            }
        });

        if (directFlightsResponse.data && directFlightsResponse.data.data && directFlightsResponse.data.data.length > 0) {
          //  console.log('Direct Flights Response:', JSON.stringify(directFlightsResponse.data.data, null, 2));
            directFlightsResponse.data.data.forEach(route => {
                const airlineCode = route.airline_iata;
                if (!airlineCodes.includes(airlineCode)) {
                    airlineCodes.push(airlineCode);
                    flightTypeMap[airlineCode] = 'direct';
                }
            });
        }

        // Fetch indirect flights if necessary
        //console.log('Fetching indirect flights...');
        const firstLegResponse = await axios.get('https://app.goflightlabs.com/routes', {
            params: {
                access_key: FLIGHTLABS_API_KEY,
                dep_iata: originCode,
                _fields: 'airline_iata,arr_iata'
            }
        });

        if (firstLegResponse.data && firstLegResponse.data.data && firstLegResponse.data.data.length > 0) {
            const connectionAirports = [...new Set(firstLegResponse.data.data.map(route => route.arr_iata))];

            const secondLegResponses = await Promise.all(connectionAirports.map(async (connectionAirport) => {
                try {
                    return await axios.get('https://app.goflightlabs.com/routes', {
                        params: {
                            access_key: FLIGHTLABS_API_KEY,
                            dep_iata: connectionAirport,
                            arr_iata: destinationCode,
                            _fields: 'airline_iata'
                        }
                    });
                } catch (error) {
                    console.error(`Error fetching second leg from ${connectionAirport}:`, error.message);
                    return null;
                }
            }));

            secondLegResponses.forEach(response => {
                if (response && response.data && response.data.data && response.data.data.length > 0) {
                    response.data.data.forEach(route => {
                        const airlineCode = route.airline_iata;
                        if (!airlineCodes.includes(airlineCode)) {
                            airlineCodes.push(airlineCode);
                            flightTypeMap[airlineCode] = 'indirect';
                        }
                    });
                }
            });
        }

        let airlineNamesMap = {};

        // Use OpenAI API to translate IATA codes to airline names
        if (airlineCodes.length > 0) {
            try {
                const prompt = `Translate the following IATA airline codes to their respective airline names: ${airlineCodes.join(', ')}. Please provide each translation on a new line in the format "IATA Code: Airline Name".`;

                const response = await openai.chat.completions.create({
                    model: "gpt-4",
                    messages: [{ role: "user", content: prompt }],
                });

                const airlinesInfo = response.choices[0].message.content.trim().split('\n');
                airlinesInfo.forEach(line => {
                    const [iataCode, name] = line.split(':').map(item => item.trim());
                    if (iataCode && name) {
                        airlineNamesMap[iataCode] = name;
                    }
                });
            } catch (error) {
                console.error('Error fetching airline data from OpenAI:', error.message);
            }
        }

        // Create and save flight data
        flightData = new Flight({
            originCode,
            destinationCode,
            airlineCodes,
            airlineNamesMap,
            flightTypeMap,
        });
        await flightData.save();

       // console.log('Airlines Data for Mapping Pet Policies:', airlines);

       
        // Fetch airline data to include pet policy URLs
        const validAirlineCodes = Object.keys(flightData.airlineNamesMap)
            .filter(code => code !== null && code !== undefined)
            .map(code => code.trim().toUpperCase());

        const petPolicyAirlines  = await Airline.find({ airlineCode: { $in: validAirlineCodes } });
       // console.log('Reached Pet Policy Mapping section'); // Log for debugging


        const petPolicyMap = {};
        petPolicyAirlines.forEach(airline => {
            petPolicyMap[airline.airlineCode] = airline.petPolicyURL;
        });

        // Log to confirm what is being passed to the EJS template
       // console.log('Airline Codes:', airlineCodes);
       // console.log('Airline Names Map:', airlineNamesMap);
       // console.log('Flight Type Map:', flightTypeMap);
       // console.log('Pet Policy Map:', petPolicyMap);

        res.render('regulations/showFlights', {
            flights: airlineCodes,
            airlineNamesMap,
            flightTypeMap,
            petPolicyMap
        });
    } catch (error) {
        console.error('Error fetching flight data from FlightLabs:', error.message);
        if (!res.headersSent) {
            res.status(500).send('Error fetching flight data.');
        }
    }
});






// GET Route to Retrieve Flights using FlightLabs API
router.get('/flights', async (req, res) => {
    try {
        const { origin, destination } = req.query;

        // If there is origin and destination in the query, use them
        if (origin && destination) {
            console.log('Reconstructing search from saved criteria:', { origin, destination });

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
