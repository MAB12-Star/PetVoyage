const express = require('express');
const router = express.Router();
const Airline = require('../models/airline'); // Import the correct Airline model
const { redirectOldAirlineLinks } = require('../middleware');

router.use(redirectOldAirlineLinks);
// Route to fetch all airlines (names only)
router.get('/airlines', async (req, res) => {
    try {
        const airlines = await Airline.find({}, 'name _id slug'); // Fetch name, _id, and slug
        res.json(airlines); // Return as JSON
    } catch (error) {
        console.error("Error fetching airlines:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});


// Route to fetch airline details by slug
router.get('/airlines/:slug', redirectOldAirlineLinks, async (req, res) => {
  try {
    const slug = req.params.slug;
    const airline = await Airline.findOne({ slug }).populate('reviews').exec();

    if (!airline) return res.status(404).send("Airline not found.");

    const airlineName = airline.name || 'This Airline';

    // ✅ ALWAYS use canonical base URL (avoid http behind proxy)
    const base = (process.env.BASE_URL || 'https://www.petvoyage.ai').replace(/\/+$/, '');
    const link = `${base}/airlines/${airline.slug}`;

    // ✅ Make OG image absolute
    const ogImage = (airline.logo && airline.logo.startsWith('http'))
      ? airline.logo
      : `${base}${airline.logo || '/images/default-airline.png'}`;

    // ✅ Clean summary for JSON-LD (no HTML)
    const plainSummary = (airline.ImprovedPetPolicySummary || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240);

    // ✅ JSON-LD Structured Data (AUTOMATIC for all airlines)
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": `${airlineName} Pet Policy`,
      "description": plainSummary || `Pet travel policy details for ${airlineName}.`,
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": link
      },
      "author": {
        "@type": "Organization",
        "name": "PetVoyage"
      },
      "publisher": {
        "@type": "Organization",
        "name": "PetVoyage",
        "logo": {
          "@type": "ImageObject",
          "url": `${base}/images/logo.png`
        }
      },
      "image": ogImage,
      "dateModified": new Date(
        airline.updatedAt || airline.createdAt || Date.now()
      ).toISOString()
    };

    res.render('regulations/showAirline', {
      airline,
      slug,
      link,

      // ✅ Structured data
      jsonLd,

      ImprovedPetPolicySummary:
        airline.ImprovedPetPolicySummary || 'No pet policy summary available.',

      // SEO Metadata
      title: `${airlineName} Pet Policy | PetVoyage`,
      metaDescription: `Review the pet travel policy for ${airlineName}. See if your pet can fly in the cabin, cargo, or as a service animal.`,
      metaKeywords: `${airlineName} pet policy, fly with pets ${airlineName}, ${airlineName} cabin cargo pet rules`,
      ogTitle: `${airlineName} Pet Policy`,
      ogDescription: `Everything you need to know about flying with pets on ${airlineName}. Updated airline regulations and pet travel rules.`,
      ogImage,
      ogUrl: link,
      twitterTitle: `Pet Travel with ${airlineName}`,
      twitterDescription: `See ${airlineName}'s rules for pets flying in cabin, cargo, or as service animals.`,
      twitterImage: ogImage,

      // Pet-related data (unchanged)
      microchipMap: {},
      healthCertificateMap: {},
      logo: {},
      inCargoAnimals: {},
      inCompartmentAnimals: {},
      dangerousBreeds: {},
      brachycephalic: {},
      serviceAnimals: {},
      esAnimals: {},
      petShipping: {},
      healthVaccinations: {},
      dangerousBreedList: {},
      brachycephalicBreedList: {},
      inCompartmentDetails: {},
      inCargoDetails: {},
      serviceAnimalDetails: {},
      carrierCargoDetails: {},
      carrierCompartmentDetails: {},
      esaDetails: {}
    });
  } catch (error) {
    console.error("Error fetching airline:", error);
    res.status(500).send("Server Error");
  }
});


  router.get('/airlines/list', async (req, res) => {
    try {
      const airlines = await Airline.find({}, 'name slug');
  
      res.render('airlineList', {
        airlines,
        title: 'All Airline Pet Policies | PetVoyage',
        metaDescription: 'Explore a full list of airline pet policies. Compare in-cabin, cargo, and service animal options for each airline.',
        metaKeywords: 'airline pet policies, fly with pets, airline list for pets, pet travel airlines, service animals',
        ogTitle: 'Airline Pet Policies List',
        ogDescription: 'See which airlines allow pets in cabin, cargo, or as service animals. Updated airline rules for pets.',
        ogImage: '/images/airlines-banner.jpg',
        ogUrl: 'https://www.petvoyage.ai/airlines/list',
        twitterTitle: 'Compare Airline Pet Policies',
        twitterDescription: 'Check all major airlines for their latest pet travel rules.',
        twitterImage: '/images/airlines-banner.jpg'
      });
    } catch (error) {
      console.error("Error rendering airline list:", error);
      res.status(500).send("Server Error");
    }
  });
  


module.exports = router;
