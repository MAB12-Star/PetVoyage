// File: routes/countryRegulationList.js
const express = require('express');
const router = express.Router();
const CountryRegulation = require("../models/countryPetRegulationList");



router.get('/getCountryRegulationList', async (req, res) => {
  try {
    const countries = await CountryRegulation.find().distinct('destinationCountry');
    console.log("[LOG] Retrieved countries for dropdown:", countries);

    res.render('regulations/countryRegulationList', {
      countries,
      title: 'Country Pet Import Rules | PetVoyage',
      metaDescription: 'Select a country to view pet import and export requirements. Get current regulations for cats, dogs, and other pets.',
      metaKeywords: 'pet import rules, pet travel by country, international pet policies, pet export rules, dog cat travel regulations',
      ogTitle: 'Pet Travel Regulations by Country',
      ogDescription: 'Use PetVoyage to find country-specific rules for pet import, export, vaccinations, and more.',
      ogUrl: 'https://www.petvoyage.ai/getCountryRegulationList',
      ogImage: '/images/country-regulations-banner.jpg',
      twitterTitle: 'Pet Travel Rules by Country | PetVoyage',
      twitterDescription: 'Browse country-specific pet travel regulations including microchip, certification, vaccination, and quarantine rules.',
      twitterImage: '/images/country-regulations-banner.jpg'
    });
  } catch (err) {
    console.error("[ERROR] Failed to fetch country list:", err);
    res.status(500).send("Server Error");
  }
});

  

router.get('/country/:country', async (req, res) => {
  try {
    const country = req.params.country;
    console.log("[LOG] Fetching regulations for:", country);

    const regulations = await CountryRegulation.findOne({ destinationCountry: country }).lean();

    if (!regulations) {
      console.warn(`[WARN] No regulations found for ${country}`);
      return res.status(404).send('Country regulations not found.');
    }

    if (regulations.regulationsByPetType instanceof Map || typeof regulations.regulationsByPetType === 'object') {
      regulations.regulationsByPetType = Object.fromEntries(
        Object.entries(regulations.regulationsByPetType).filter(
          ([key]) => !key.startsWith('$_')
        )
      );
    }

    const safeCountry = regulations.destinationCountry || 'this country';
    const pageUrl = `https://www.petvoyage.ai/country/${encodeURIComponent(safeCountry)}`;

    res.render('regulations/showCountry', {
      regulations,
      title: `Pet Travel Requirements for ${safeCountry}`,
      metaDescription: `Explore pet travel requirements for ${safeCountry}, including import rules, documentation, and vaccination policies.`,
      metaKeywords: `pet travel ${safeCountry}, import pets to ${safeCountry}, ${safeCountry} pet rules, pet documentation, dog travel, cat travel`,
      ogTitle: `Pet Import Regulations for ${safeCountry}`,
      ogDescription: `Get up-to-date pet import and export regulations for ${safeCountry}. Includes quarantine info, documents, and official sources.`,
      ogUrl: req.originalUrl || `https://www.petvoyage.ai/country/${encodeURIComponent(safeCountry)}`,
      ogImage: '/images/pet-travel-map.jpg',
      twitterTitle: `Bringing Pets to ${safeCountry}?`,
      twitterDescription: `Learn the latest pet travel policies for ${safeCountry}, including entry requirements and official links.`,
      twitterImage: '/images/pet-travel-map.jpg'
    });
    
      
    console.log("[SEO] Rendering page with metadata:");
    console.log("  Title:", `Pet Travel Regulations for ${safeCountry}`);
    console.log("  Description:", `Find import/export rules for traveling with your  ${safeCountry}.`);
    console.log("  Keywords:", `pet regulations ${safeCountry}, pet import/export rules`);


  } catch (err) {
    console.error("[ERROR] Failed to fetch country regulation:", err);
    res.status(500).send("Server Error");
  }
});

  

module.exports = router;
