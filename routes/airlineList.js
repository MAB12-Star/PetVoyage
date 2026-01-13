const express = require('express');
const router = express.Router();
const Airline = require('../models/airline');
const Ad = require('../models/ad');

router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = parseInt(req.query.perPage, 10) || 12;
    const safePerPage = perPage > 0 ? perPage : 12;

    const filter = {};

    const [airlines, totalAirlines] = await Promise.all([
      Airline.find(filter)
        .sort({ name: 1 })
        .skip((page - 1) * safePerPage)
        .limit(safePerPage)
        .lean(),
      Airline.countDocuments(filter)
    ]);

    const totalPages = Math.max(1, Math.ceil(totalAirlines / safePerPage));
    const currentPage = Math.min(Math.max(page, 1), totalPages);

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
      perPage: safePerPage,
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
