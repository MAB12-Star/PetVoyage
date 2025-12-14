const express = require('express');
const router = express.Router();
const Airline = require('../models/airline');
const Ad = require('../models/ad'); // Make sure this is added

router.get('/', async (req, res) => {
  try {
    const airlines = await Airline.find({});

    // Clean path for matching ads (removes query params like ?filter=...)
    const pathname = req.originalUrl ? req.originalUrl.split('?')[0] : '/regulations/airlineList';

    // Fetch ads where pages match this page OR wildcard (*)
    const pageAds = await Ad.find({
      active: true,
      pages: { $in: [pathname, '*'] }
    }).lean();

    res.render('regulations/airlineList', {
      airlines,
      pageAds,  // ⬅️ Crucial

      // Metadata
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
