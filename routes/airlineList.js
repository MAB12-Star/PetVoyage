const express = require('express');
const router = express.Router();
const Airline = require('../models/airline');
const Ad = require('../models/ad');

router.get('/', async (req, res) => {
  try {
    const requestedPage = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = [6,12,24,48].includes(Number(req.query.perPage)) ? Number(req.query.perPage) : 12;
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0,100) : '';
    const modeFields = {cabin:'inCompartment', hold:'inCargo', shipping:'petShipping', service:'serviceAnimals', esa:'esAnimals'};
    const modes = [].concat(req.query.mode || []).filter(mode => typeof mode === 'string' && Object.hasOwn(modeFields,mode));
    const breed = ['restricted','unknown','all'].includes(req.query.breed) ? req.query.breed : '';
    const filter = {};
    if (query) {
      const escaped = query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const accents = {a:'[aáàäâã]',e:'[eéèëê]',i:'[iíìïî]',o:'[oóòöôõ]',u:'[uúùüû]'};
      filter.name = new RegExp(escaped.replace(/[aeiou]/gi, c => accents[c.toLowerCase()]),'i');
    }
    for (const mode of modes) filter[modeFields[mode]] = /^yes$/i;
    // A legacy "No" flag is not a route-specific all-breeds policy.
    if (breed === 'restricted') filter.dangerousBreeds = /^yes$/i;
    if (breed === 'unknown') filter.dangerousBreeds = {$not:/^yes$/i};
    if (breed === 'all') filter._id = {$exists:false};
    const totalAirlines = await Airline.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(totalAirlines / perPage));
    const currentPage = Math.min(requestedPage,totalPages);
    const airlines = await Airline.find(filter).sort({name:1}).skip((currentPage-1)*perPage).limit(perPage).lean();
    const pageUrl = page => {
      const params = new URLSearchParams({page,perPage});
      if (query) params.set('q',query);
      if (breed) params.set('breed',breed);
      for (const mode of modes) params.append('mode',mode);
      return '?' + params;
    };

    // path only (e.g. "/regulations/airlineList")
    const pathname = req.originalUrl ? req.originalUrl.split('?')[0] : '/regulations/airlineList';
    // full URL (e.g. "http://localhost:3000/regulations/airlineList")
    const fullUrl = `${req.protocol}://${req.get('host')}${pathname}`;

    const pageAds = await Ad.find({
      active: true,
      pages: { $in: [pathname, fullUrl, '*'] }
    }).lean();

    // console.log('pageAds length:', pageAds.length); // debug if you want

    res.render('regulations/airlineList', {
      airlines,
      pageAds,
      currentPage,
      totalPages,
      perPage, query, modes, breed, pageUrl,
      totalAirlines,
      title: 'Airlines That Accept Pets | PetVoyage',
      metaDescription: 'Browse airlines with pet travel options. Compare airline pet policies for in-cabin, cargo, and service animals.',
      metaKeywords: 'airline pet policy, fly with pets, pet cargo rules, in-cabin pets, service animal travel, ESA travel',
      ogUrl: 'https://www.petvoyage.ai/regulations/airlineList',
      ogImage: 'https://www.petvoyage.ai/images/Logo.png',
      twitterTitle: 'Airline Pet Travel Rules | PetVoyage',
      twitterDescription: 'See which airlines allow pets in cabin, cargo, or as service animals. Get your pet ready for takeoff!'
    });

  } catch (error) {
    console.error("Error loading airline list:", error);
    res.status(500).send("Error loading airlines");
  }
});

module.exports = router;
