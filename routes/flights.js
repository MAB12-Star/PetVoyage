const express = require('express');
const router = express.Router();
const axios = require('axios');
const Airport = require('../models/airlineRegulations');
const Flight = require('../models/flightSchema');
const Airline = require('../models/airline');
const { saveCurrentUrl } = require('../middleware');
const mongoose = require('mongoose');
// const cheerio = require('cheerio'); // (not used right now)
const OpenAI = require("openai").default;

const FLIGHTLABS_API_KEY =
  process.env.FLIGHTLABS_API_KEY_ENV || process.env.FLIGHTLABS_API_KEY;
console.log('[FlightLabs] key present?', !!FLIGHTLABS_API_KEY);

const openai = new OpenAI({ apiKey: process.env.openaiKey });

const catchAsync = require('../utils/catchAsync');

/* ----------------------------- helpers (slug) ----------------------------- */
function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}
function buildRouteSlug(originName, destinationName, originCode, destinationCode) {
  const from = slugify(originName) || slugify(originCode);
  const to   = slugify(destinationName) || slugify(destinationCode);
  return `${from}-to-${to}`;
}
async function ensureUniqueSlug(baseSlug, FlightModel) {
  let slug = baseSlug;
  let i = 2;
  while (await FlightModel.exists({ slug })) {
    slug = `${baseSlug}-${i++}`;
  }
  return slug;
}

/* ------------------------ major hubs (one-stop throttle) ------------------------ */
const MAJOR_HUBS = new Set([
  // North America
  'ATL','DFW','DEN','ORD','LAX','JFK','EWR','SFO','SEA','MIA','CLT','IAH','PHX','BOS','MSP','DTW','PHL','IAD','BWI','SLC','SAN','MCO','TPA','YYZ','YVR','MEX',
  // Europe
  'LHR','CDG','FRA','AMS','MAD','BCN','FCO','IST','ZRH','MUC','CPH','OSL','ARN','DUB','LGW','BRU','VIE','WAW',
  // Middle East
  'DXB','DOH','AUH',
  // Asia
  'HND','NRT','ICN','HKG','SIN','KUL','BKK','TPE','PVG','PEK','CAN','DEL','BOM',
  // Oceania
  'SYD','MEL','AKL',
  // South America
  'GRU','GIG','SCL','EZE','BOG'
]);
const MAX_HUBS = 12;
const BATCH_SIZE = 2;
const BETWEEN_BATCH_DELAY = 1200;
const TARGET_MIN_AIRLINES = 25;

/* ----------------------------- axios helpers ----------------------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWithRetry(url, params, { attempts = 5, baseDelayMs = 600 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await axios.get(url, { params });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429) {
        const retryAfterSec = Number(err.response?.headers?.['retry-after']) || 0;
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

const _memo = new Map();
function stableKey(url, params) {
  const sorted = Object.keys(params || {}).sort().reduce((o, k) => (o[k] = params[k], o), {});
  return `${url}?${JSON.stringify(sorted)}`;
}
async function getMemo(url, params, opts) {
  const key = stableKey(url, params);
  if (_memo.has(key)) return _memo.get(key);
  const res = await getWithRetry(url, params, opts);
  _memo.set(key, res);
  return res;
}
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* --------------------------------- routes -------------------------------- */
router.get('/searchFlights', catchAsync((req, res) => {
  // user is available via res.locals.user from your app.js middleware
  res.render('regulations/searchFlights');
}));

/* ------------------- map lat/lng from client -> IATA codes ------------------- */
const mapAirportToIATA = async (req, res, next) => {
  let {
    selectedAirportLat,
    selectedAirportLng,
    selectedDestinationLat,
    selectedDestinationLng,
  } = req.body;

  const latA = parseFloat(selectedAirportLat);
  const lngA = parseFloat(selectedAirportLng);
  const latB = parseFloat(selectedDestinationLat);
  const lngB = parseFloat(selectedDestinationLng);

  console.log('Selected Airport Latitude:', latA);
  console.log('Selected Airport Longitude:', lngA);
  console.log('Selected Destination Latitude:', latB);
  console.log('Selected Destination Longitude:', lngB);

  if (
    Number.isNaN(latA) || Number.isNaN(lngA) ||
    Number.isNaN(latB) || Number.isNaN(lngB)
  ) {
    console.error('[IATA] Missing/invalid lat/lng from client—cannot resolve IATA.');
    return res.status(400).send('Please choose both origin and destination airports.');
  }

  try {
    const originResponse = await axios.get(`http://www.iatageo.com/getCode/${latA}/${lngA}`);
    const destinationResponse = await axios.get(`http://www.iatageo.com/getCode/${latB}/${lngB}`);

    const originCode = originResponse.data?.IATA;
    const destinationCode = destinationResponse.data?.IATA;

    if (!originCode || !destinationCode) {
      console.error('[IATA] Could not resolve one or both IATA codes.', {
        originCode,
        destinationCode
      });
      return res.status(502).send('Unable to resolve IATA codes. Try a different airport.');
    }

    console.log('Fetched Origin IATA Code:', originCode);
    console.log('Fetched Destination IATA Code:', destinationCode);

    req.body.originCode = originCode;
    req.body.destinationCode = destinationCode;
    console.log('Request Body after IATA mapping:', req.body);

    next();
  } catch (error) {
    console.error('Error fetching IATA codes:', error?.message || error);
    res.status(500).send('Error fetching IATA codes.');
  }
};

/* ---------------------------- handle flight search ---------------------------- */
router.post('/searchFlights', saveCurrentUrl, mapAirportToIATA, async (req, res) => {
  const { originCode, destinationCode } = req.body;
  const originName = (req.body.selectedAirport || '').trim();
  const destinationName = (req.body.selectedDestinationAirport || '').trim();

  if (!FLIGHTLABS_API_KEY) {
    console.error('[FlightLabs] Missing API key');
    return res.status(500).send('Flight search unavailable. Missing configuration.');
  }

  try {
    // Reuse cached DB result if any
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
      const target = `/flights/${encodeURIComponent(flightData.slug || String(flightData._id))}`;
      return res.redirect(303, target);
    }

    /* ------------------------------ build fresh data ------------------------------ */
    let airlineCodes = [];
    const flightTypeMap = {};

    // DIRECT (0 stops)
    const directResp = await getMemo('https://app.goflightlabs.com/routes', {
      access_key: FLIGHTLABS_API_KEY,
      dep_iata: originCode,
      arr_iata: destinationCode,
      _fields: 'airline_iata,connection_count',
    }, { attempts: 5, baseDelayMs: 600 });

    (directResp.data?.data || []).forEach(r => {
      if ((r.connection_count ?? 0) === 0) {
        const code = (r.airline_iata || '').trim().toUpperCase();
        if (code && !airlineCodes.includes(code)) {
          airlineCodes.push(code);
          flightTypeMap[code] = 'direct';
        }
      }
    });

    // ONE-STOP (origin -> HUB -> destination) — hub-constrained
    const firstLegResp = await getMemo('https://app.goflightlabs.com/routes', {
      access_key: FLIGHTLABS_API_KEY,
      dep_iata: originCode,
      _fields: 'airline_iata,arr_iata,connection_count',
    }, { attempts: 5, baseDelayMs: 600 });

    const allDirectArrivals = (firstLegResp.data?.data || [])
      .filter(r => (r.connection_count ?? 0) === 0)
      .map(r => r.arr_iata)
      .filter(Boolean);

    let hubs = [...new Set(allDirectArrivals)].filter(code => MAJOR_HUBS.has(code));
    if (hubs.length === 0) hubs = [...new Set(allDirectArrivals)].slice(0, 5); // rare fallback
    const selectedHubs = hubs.slice(0, MAX_HUBS);

    console.log('[Routes] Using hubs:', selectedHubs.join(', '));

    // batched queries to limit rate
    const batches = chunk(selectedHubs, BATCH_SIZE);
    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map((hub) =>
          getMemo('https://app.goflightlabs.com/routes', {
            access_key: FLIGHTLABS_API_KEY,
            dep_iata: hub,
            arr_iata: destinationCode,
            _fields: 'airline_iata,connection_count',
          }, { attempts: 5, baseDelayMs: 600 })
        )
      );

      results.forEach((res, idx) => {
        const hub = batch[idx];
        if (res.status === 'fulfilled') {
          const list = res.value?.data?.data || [];
          list.forEach(route => {
            if ((route.connection_count ?? 0) === 0) {
              const code = (route.airline_iata || '').trim().toUpperCase();
              if (code && !airlineCodes.includes(code)) {
                airlineCodes.push(code);
                if (!flightTypeMap[code]) flightTypeMap[code] = 'indirect';
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

    // normalize unique codes
    airlineCodes = [...new Set((airlineCodes || []).map(c => (c || '').trim().toUpperCase()))].filter(Boolean);

    // enrich names from DB where available
    const airlineDocs = await Airline.find({ airlineCode: { $in: airlineCodes } });
    const airlineNamesMap = {};
    for (const a of airlineDocs) {
      const code = (a.airlineCode || '').trim().toUpperCase();
      if (code) airlineNamesMap[code] = a.name || '';
    }
    const missing = airlineCodes.filter(c => !airlineNamesMap[c]);
    if (missing.length) console.warn('[Flights] Names missing in DB for:', missing.join(', '));

    // persist result
    const baseSlug = buildRouteSlug(originName, destinationName, originCode, destinationCode);
    const uniqueSlug = await ensureUniqueSlug(baseSlug, Flight);

    const newDoc = new Flight({
      originCode,
      destinationCode,
      airlineCodes,
      airlineNamesMap,
      flightTypeMap,
      originName: originName || originCode,
      destinationName: destinationName || destinationCode,
      slug: uniqueSlug,
    });
    await newDoc.save();

    const target = `/flights/${encodeURIComponent(newDoc.slug)}`;
    return res.redirect(303, target);

  } catch (error) {
    console.error('Error fetching flight data:', error.message);
    if (!res.headersSent) {
      return res.status(500).send('Error fetching flight data.');
    }
  }
});

/* ------------------------------- show flights ------------------------------ */
router.get('/:slugOrId', async (req, res, next) => {
  const reserved = new Set(['searchFlights', 'flights']);
  if (reserved.has(req.params.slugOrId)) return next();

  try {
    let flightData = await Flight.findOne({ slug: req.params.slugOrId });
    if (!flightData && mongoose.Types.ObjectId.isValid(req.params.slugOrId)) {
      flightData = await Flight.findById(req.params.slugOrId);
    }
    if (!flightData) return res.status(404).send('Search results not found');

    const validAirlineCodes = (flightData.airlineCodes || [])
      .filter(Boolean)
      .map(c => String(c).trim().toUpperCase());

    const airlines = await Airline.find({ airlineCode: { $in: validAirlineCodes } });

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

    const airlineNamesMap =
      (flightData.airlineNamesMap && Object.keys(flightData.airlineNamesMap).length > 0)
        ? flightData.airlineNamesMap
        : dbAirlineNamesMap;

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

      title: 'Pet-Friendly Airlines for Your Route | PetVoyage',
      metaDescription: 'View airline pet travel policies based on your search. Quickly find pet-friendly flights and compare animal requirements by airline.',
      metaKeywords: 'flight pet travel, pet-friendly flights, airline pet policy comparison, travel with pets, find pet airlines',
      ogTitle: 'Compare Airline Pet Policies by Route',
      ogDescription: 'See results for your flight route and find which airlines allow pets in cabin, cargo, or as service animals.',
      ogUrl: flightData.slug
        ? `https://www.petvoyage.ai/flights/${encodeURIComponent(flightData.slug)}`
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

/* ----------------------------- legacy (kept) ----------------------------- */
// Simple GET route you had; preserves old behavior for rehydrating flights by query
router.get('/flights', async (req, res) => {
  try {
    const { origin, destination } = req.query;
    if (origin && destination) {
      const flights = await getFlightsFromCriteria(origin, destination); // <-- assumes you have this helper
      const airlineCodes = flights.flatMap(f =>
        f.itineraries.flatMap(it =>
          it.segments.map(s => s.carrierCode)
        )
      );
      const uniqueAirlineCodes = [...new Set(airlineCodes)];
      const regulations = await Airport.find({ airlineCode: { $in: uniqueAirlineCodes } });
      const regulationMap = regulations.reduce((acc, r) => (acc[r.airlineCode] = r, acc), {});
      res.render('flights', { flights, regulationMap });
      return;
    }
    res.render('flights', { flights: [], regulationMap: {} });
  } catch (error) {
    console.error('Error retrieving flights:', error.message);
    res.status(500).send('Error retrieving flights.');
  }
});

module.exports = router;
