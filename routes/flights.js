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
const FLIGHTLABS_API_KEY =
  process.env.FLIGHTLABS_API_KEY_ENV || process.env.FLIGHTLABS_API_KEY;
console.log('[FlightLabs] key present?', !!FLIGHTLABS_API_KEY);

const openai = new OpenAI({
    apiKey: process.env.openaiKey
});

const catchAsync = require('../utils/catchAsync');

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120); // safety limit
}

// Build a nice route slug from names (falls back to codes)
function buildRouteSlug(originName, destinationName, originCode, destinationCode) {
  const from = slugify(originName) || slugify(originCode);
  const to   = slugify(destinationName) || slugify(destinationCode);
  return `${from}-to-${to}`;
}

// Ensure slug is unique (append -2, -3, … if needed)
async function ensureUniqueSlug(baseSlug, FlightModel) {
  let slug = baseSlug;
  let i = 2;
  while (await FlightModel.exists({ slug })) {
    slug = `${baseSlug}-${i++}`;
  }
  return slug;
}


router.get('/searchFlights', catchAsync((req, res) => {
    res.render('regulations/searchFlights');
}));


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
       console.log('Fetched Origin IATA Code:', originCode);

        // Fetch the IATA code for the selected destination airport using lat/lng
        const destinationResponse = await axios.get(`http://www.iatageo.com/getCode/${selectedDestinationLat}/${selectedDestinationLng}`);
        const destinationCode = destinationResponse.data.IATA; // IATA code for destination

        console.log('Fetched Destination IATA Code:', destinationCode);

        // Store the IATA codes in the request body for further use
        req.body.originCode = originCode;
        req.body.destinationCode = destinationCode;

        // Log the request body to confirm the codes are stored correctly
       console.log('Request Body after IATA mapping:', req.body);

        next(); // Proceed to the next middleware or route handler
    } catch (error) {
        console.error('Error fetching IATA codes:', error);
        res.status(500).send('Error fetching IATA codes.');
    }
};


router.post('/searchFlights', saveCurrentUrl, mapAirportToIATA, async (req, res) => {
  const { originCode, destinationCode } = req.body;

  // e.g., "San Francisco International Airport", "Mexico City International Airport Benito Juárez"
  const originName = (req.body.selectedAirport || '').trim();
  const destinationName = (req.body.selectedDestinationAirport || '').trim();

  try {
    // ✅ Check if flight data is cached in the database
    let flightData = await Flight.findOne({ originCode, destinationCode });

    if (flightData) {
      // Backfill slug & names if missing
      if (!flightData.slug) {
        const baseSlug = buildRouteSlug(originName, destinationName, originCode, destinationCode);
        const uniqueSlug = await ensureUniqueSlug(baseSlug, Flight);
        if (originName) flightData.originName = originName;
        if (destinationName) flightData.destinationName = destinationName;
        flightData.slug = uniqueSlug;
        await flightData.save();
      }

      req.session.currentPage = { searchId: flightData._id, originCode, destinationCode };

      // ✅ Redirect to SEO-friendly slug page
      const target = `/flights/${encodeURIComponent(flightData.slug || String(flightData._id))}`;
      return res.redirect(303, target);
    }

    // ----------------------------------------------------------
    // ✈️ Fetch flight data (direct + one stop)
    // ----------------------------------------------------------
    let airlineCodes = [];
    let flightTypeMap = {};

    // --- DIRECT (0 stops) ---
    const directResp = await axios.get('https://app.goflightlabs.com/routes', {
      params: {
        access_key: FLIGHTLABS_API_KEY,
        dep_iata: originCode,
        arr_iata: destinationCode,
        _fields: 'airline_iata,connection_count',
      },
    });

    if (directResp.data?.data?.length > 0) {
      for (const r of directResp.data.data) {
        if ((r.connection_count ?? 0) === 0) {
          const code = (r.airline_iata || '').trim().toUpperCase();
          if (code && !airlineCodes.includes(code)) {
            airlineCodes.push(code);
            flightTypeMap[code] = 'direct';
          }
        }
      }
    }

    // --- ONE STOP (dep -> hub -> dest) ---
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    async function getWithRetry(url, params, { attempts = 5, baseDelayMs = 600 } = {}) {
      for (let i = 0; i < attempts; i++) {
        try {
          return await axios.get(url, { params });
        } catch (err) {
          const status = err?.response?.status;
          if (status === 429) {
            const retryAfterSec = Number(err.response.headers?.['retry-after']) || 0;
            const delayMs = Math.max(retryAfterSec * 1000, baseDelayMs * Math.pow(2, i));
            console.warn(`[429] Backing off ${delayMs}ms (attempt ${i + 1}/${attempts})`);
            await sleep(delayMs);
            continue;
          }
          throw err;
        }
      }
      throw new Error(`Exceeded retry attempts for ${url}`);
    }

    function chunk(arr, size) {
      const out = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    }

    // dep -> hub (direct only)
    const firstLegResp = await axios.get('https://app.goflightlabs.com/routes', {
      params: {
        access_key: FLIGHTLABS_API_KEY,
        dep_iata: originCode,
        _fields: 'airline_iata,arr_iata,connection_count',
      },
    });

    const hubs = [...new Set(
      (firstLegResp.data?.data || [])
        .filter((r) => (r.connection_count ?? 0) === 0)
        .map((r) => r.arr_iata)
    )].filter(Boolean);

    const MAX_HUBS = 30;
    const BATCH_SIZE = 5;
    const BETWEEN_BATCH_DELAY = 800;
    const TARGET_MIN_AIRLINES = 60;

    const selectedHubs = hubs.slice(0, MAX_HUBS);
    const batches = chunk(selectedHubs, BATCH_SIZE);

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map((hub) =>
          getWithRetry('https://app.goflightlabs.com/routes', {
            access_key: FLIGHTLABS_API_KEY,
            dep_iata: hub,
            arr_iata: destinationCode,
            _fields: 'airline_iata,connection_count',
          })
        )
      );

      results.forEach((res, idx) => {
        const hub = batch[idx];
        if (res.status === 'fulfilled') {
          const list = res.value?.data?.data || [];
          list.forEach((route) => {
            if ((route.connection_count ?? 0) === 0) {
              const code = (route.airline_iata || '').trim().toUpperCase();
              if (code && !airlineCodes.includes(code)) {
                airlineCodes.push(code);
                flightTypeMap[code] = 'indirect'; // one-stop
              }
            }
          });
        } else {
          const err = res.reason;
          const status = err?.response?.status;
          console.warn(`Second leg from ${hub} failed${status ? ` (status ${status})` : ''}: ${err?.message}`);
        }
      });

      if (airlineCodes.length >= TARGET_MIN_AIRLINES) break;
      await sleep(BETWEEN_BATCH_DELAY);
    }

    // ----------------------------------------------------------
    // ✈️ Normalize + save new flight record
    // ----------------------------------------------------------
    airlineCodes = [...new Set((airlineCodes || []).map((c) => (c || '').trim().toUpperCase()))].filter(Boolean);

    const airlineDocs = await Airline.find({ airlineCode: { $in: airlineCodes } });
    const airlineNamesMap = {};
    for (const a of airlineDocs) {
      const code = (a.airlineCode || '').trim().toUpperCase();
      if (code) airlineNamesMap[code] = a.name || '';
    }

    const missing = airlineCodes.filter((c) => !airlineNamesMap[c]);
    if (missing.length) console.warn('[Flights] Names missing in DB for:', missing.join(', '));

    const baseSlug = buildRouteSlug(originName, destinationName, originCode, destinationCode);
    const uniqueSlug = await ensureUniqueSlug(baseSlug, Flight);

    flightData = new Flight({
      originCode,
      destinationCode,
      airlineCodes,
      airlineNamesMap,
      flightTypeMap,
      originName: originName || originCode,
      destinationName: destinationName || destinationCode,
      slug: uniqueSlug,
    });
    await flightData.save();

    // ✅ Redirect to SEO-friendly slug page
    const target = `/flights/${encodeURIComponent(flightData.slug)}`;
    return res.redirect(303, target);

  } catch (error) {
    console.error('Error fetching flight data:', error.message);
    if (!res.headersSent) {
      return res.status(500).send('Error fetching flight data.');
    }
  }
});


router.get('/:slugOrId', async (req, res, next) => {
  // avoid clashing with fixed subpaths like /searchFlights or /flights
  const reserved = new Set(['searchFlights', 'flights']);
  if (reserved.has(req.params.slugOrId)) return next();

  try {
    let flightData = await Flight.findOne({ slug: req.params.slugOrId });

    // fallback: support old ObjectId URLs
    if (!flightData && mongoose.Types.ObjectId.isValid(req.params.slugOrId)) {
      flightData = await Flight.findById(req.params.slugOrId);
    }

    if (!flightData) return res.status(404).send('Search results not found');

    // Normalize and collect codes
    const validAirlineCodes = (flightData.airlineCodes || [])
      .filter(Boolean)
      .map(c => String(c).trim().toUpperCase());

    // Fetch airline docs
    const airlines = await Airline.find({ airlineCode: { $in: validAirlineCodes } });

    // Build all your maps for the template
    const petPolicyMap = {};
    const airlineIdMap = {};
    const airlineSlugMap = {};
    const microchipMap = {};
    const healthCertificateMap = {};
    const logo = {};
    const inCargoAnimals = {};
    const inCompartmentAnimals = {};
    const dangerousBreeds = {};
    const brachycephalic = {};
    const serviceAnimals = {};
    const esAnimals = {};
    const petShipping = {};
    const healthVaccinations = {};
    const dangerousBreedList = {};
    const brachycephalicBreedList = {};
    const dbAirlineNamesMap = {};

    airlines.forEach((airline) => {
      const code = (airline.airlineCode || '').trim().toUpperCase();
      if (!code) return;
      petPolicyMap[code] = airline.petPolicyURL;
      airlineIdMap[code] = airline._id;
      airlineSlugMap[code] = airline.slug;
      microchipMap[code] = airline.microchip;
      healthCertificateMap[code] = airline.healthCertificate;
      logo[code] = airline.logo;
      inCargoAnimals[code] = airline.inCargoAnimals;
      inCompartmentAnimals[code] = airline.inCompartmentAnimals;
      dangerousBreeds[code] = airline.dangerousBreeds;
      brachycephalic[code] = airline.brachycephalic;
      serviceAnimals[code] = airline.serviceAnimals;
      esAnimals[code] = airline.esAnimals;
      petShipping[code] = airline.petShipping;
      healthVaccinations[code] = airline.healthVaccinations;
      dangerousBreedList[code] = airline.dangerousBreedList;
      brachycephalicBreedList[code] = airline.brachycephalicBreedList;
      dbAirlineNamesMap[code] = airline.name || '';
    });

    // Prefer names saved with the Flight (if present), else fall back to DB names
    const airlineNamesMap =
      (flightData.airlineNamesMap && Object.keys(flightData.airlineNamesMap).length > 0)
        ? flightData.airlineNamesMap
        : dbAirlineNamesMap;

    // Render
    return res.render('regulations/showFlights', {
      flights: validAirlineCodes,
      airlineNamesMap,
      flightTypeMap: flightData.flightTypeMap || {},

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

      originName: flightData.originName || flightData.originCode,
      destinationName: flightData.destinationName || flightData.destinationCode,

      // SEO Meta (slug URL when available)
      title: 'Pet-Friendly Airlines for Your Route | PetVoyage',
      metaDescription: 'View airline pet travel policies based on your search. Quickly find pet-friendly flights and compare animal requirements by airline.',
      metaKeywords: 'flight pet travel, pet-friendly flights, airline pet policy comparison, travel with pets, find pet airlines',
      ogTitle: 'Compare Airline Pet Policies by Route',
      ogDescription: 'See results for your flight route and find which airlines allow pets in cabin, cargo, or as service animals.',
      ogUrl: flightData.slug ? `https://www.petvoyage.ai/flights/${encodeURIComponent(flightData.slug)}`
                             : `https://www.petvoyage.ai/flights/${flightData._id}`,
      ogImage: '/images/flight-results-pet-travel.jpg',
      twitterTitle: 'Flight Results for Traveling with Pets | PetVoyage',
      twitterDescription: 'Explore airline pet regulations for your selected flight route. See which options are best for your pet.',
      twitterImage: '/images/flight-results-pet-travel.jpg'
    });
  } catch (error) {
    console.error('Error fetching flight data (slug/id):', error.message);
    return res.status(500).send('Error fetching flight data.');
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
