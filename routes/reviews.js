const express = require('express');
const router = express.Router();
const Airline = require('../models/airline');
const Country = require('../models/countryPetRegulationList');
const Review = require('../models/review');
const { isLoggedIn } = require('../middleware');

const pets = Review.schema.path('petType').enumValues;
const modes = Review.schema.path('travelMode').enumValues;
const formUrl = '/airlines/review/new';
const airlineUrl = slug => '/airlines/' + encodeURIComponent(slug) + '#reviews';

function sameSite(req) {
  const origin = req.get('origin');
  return req.get('sec-fetch-site') !== 'cross-site' &&
    (!origin || origin === new URL(process.env.PUBLIC_BASE_URL || 'https://www.petvoyage.ai').origin);
}

router.get('/review/new', async (req, res, next) => {
  try {
    const [airlines, countries] = await Promise.all([
      Airline.find({slug: {$type: 'string', $ne: ''}}, 'name slug').sort({name: 1}).lean(),
      Country.distinct('destinationCountry')
    ]);
    res.render('regulations/airlineReview', {
      title: 'Review pet travel with an airline | PetVoyage',
      airlines, countries: countries.sort((a, b) => a.localeCompare(b)), pets, modes,
      selectedAirline: typeof req.query.airline === 'string' ? req.query.airline : '',
      selectedCountry: typeof req.query.destination === 'string' ? req.query.destination : ''
    });
  } catch (error) { next(error); }
});

async function createReview(req, res, next) {
  if (!sameSite(req)) return res.sendStatus(403);
  const input = req.body.review || {};
  const value = key => typeof input[key] === 'string' ? input[key].trim() : '';
  const slug = req.params.slug || value('airline');
  const rating = Number(value('rating'));
  const body = value('body');
  const originCountry = value('originCountry');
  const destinationCountry = value('destinationCountry');
  const petType = value('petType');
  const travelMode = value('travelMode');
  const returnUrl = req.params.slug ? airlineUrl(slug) : formUrl;
  const hasTripDetails = !req.params.slug || [originCountry, destinationCountry, petType, travelMode].some(Boolean);
  if (!slug || !Number.isInteger(rating) || rating < 1 || rating > 5 || !body || body.length > 3000 ||
      (hasTripDetails && (!originCountry || !destinationCountry || !pets.includes(petType) || !modes.includes(travelMode)))) {
    req.flash('error', 'Choose a rating and enter a comment. For a trip review, complete the route and pet travel details.');
    return res.redirect(303, returnUrl);
  }
  try {
    const airline = await Airline.findOne({slug}).select('_id slug');
    if (!airline) return res.sendStatus(404);
    const trip = hasTripDetails ? {originCountry, destinationCountry, petType, travelMode} : {};
    if (hasTripDetails) {
      const countries = await Country.distinct('destinationCountry', {destinationCountry: {$in: [originCountry, destinationCountry]}});
      if (!countries.includes(originCountry) || !countries.includes(destinationCountry)) {
        req.flash('error', 'Choose the origin and destination from the country lists.');
        return res.redirect(303, returnUrl);
      }
    }
    await Review.create({body, rating, author: req.user._id, airline: airline._id, ...trip});
    req.flash('success', 'Review added.');
    res.redirect(303, airlineUrl(airline.slug));
  } catch (error) { next(error); }
}

router.post('/review/new', isLoggedIn, createReview);
router.post('/:slug/reviews', isLoggedIn, createReview);

router.delete('/slug/:slug/reviews/:reviewId', isLoggedIn, async (req, res, next) => {
  if (!sameSite(req)) return res.sendStatus(403);
  const {slug, reviewId} = req.params;
  if (!/^[a-f0-9]{24}$/i.test(reviewId)) return res.sendStatus(404);
  try {
    const airline = await Airline.findOne({slug}).select('_id reviews');
    if (!airline) return res.sendStatus(404);
    const filter = { _id: reviewId, author: req.user._id };
    if (!airline.reviews.some(id => String(id) === reviewId)) filter.airline = airline._id;
    const deleted = await Review.deleteOne(filter);
    if (!deleted.deletedCount) return res.sendStatus(404);
    await Airline.updateOne({_id: airline._id}, {$pull: {reviews: reviewId}});
    req.flash('success', 'Review deleted.');
    res.redirect(303, airlineUrl(slug));
  } catch (error) { next(error); }
});

module.exports = router;
