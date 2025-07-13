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
    const selectedPetType = req.query.petType;

    const regulations = await CountryRegulation.findOne({ destinationCountry: country }).lean();

    if (!regulations) return res.status(404).send('Country regulations not found.');

    if (typeof regulations.regulationsByPetType === 'object') {
      regulations.regulationsByPetType = Object.fromEntries(
        Object.entries(regulations.regulationsByPetType).filter(([key]) => !key.startsWith('$_'))
      );
    }

    const safeCountry = regulations.destinationCountry;
    const defaultPet = Object.keys(regulations.regulationsByPetType)[0];
    const petType = selectedPetType || defaultPet;

    const pageUrl = `https://www.petvoyage.ai/country/${encodeURIComponent(safeCountry)}?petType=${encodeURIComponent(petType)}`;

    const seoData = {
      regulations,
      selectedPetType: petType || '',
      title: `Pet Travel Requirements for ${safeCountry} - ${petType}`,
      metaDescription: `Explore ${petType} travel requirements for ${safeCountry}, including import rules, documentation, and vaccination policies.`,
      metaKeywords: `${safeCountry} pet travel ${petType}, import ${petType} ${safeCountry}, ${safeCountry} pet rules, travel with ${petType}, pet documentation ${safeCountry}`,
      ogTitle: `Pet Import Regulations for ${safeCountry} - ${petType}`,
      ogDescription: `Get pet import/export regulations for ${petType}s traveling to ${safeCountry}.`,
      ogUrl: pageUrl,
      ogImage: '/images/pet-travel-map.jpg',
      twitterTitle: `Bringing Your ${petType} to ${safeCountry}?`,
      twitterDescription: `Learn the latest ${petType} travel requirements for ${safeCountry}.`
    };
    
    console.log("[SEO] Rendering showCountry with:", seoData);
    
    res.render('regulations/showCountry', seoData);
    
  } catch (err) {
    console.error("[ERROR] Failed to fetch country regulation:", err);
    res.status(500).send("Server Error");
  }
});


  

module.exports = router;
