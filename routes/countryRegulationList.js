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
    const selectedPetTypeRaw = req.query.petType || '';

    const regulations = await CountryRegulation.findOne({ destinationCountry: country }).lean();
    if (!regulations) return res.status(404).send('Country regulations not found.');

    // --- helpers ---
    const slugKey = s => String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Strip any transient keys (your existing cleanup)
    if (typeof regulations.regulationsByPetType === 'object') {
      regulations.regulationsByPetType = Object.fromEntries(
        Object.entries(regulations.regulationsByPetType).filter(([key]) => !key.startsWith('$_'))
      );
    }

    // Build a slug->originalKey map so we can select by pretty names or slugs
    const petEntries = Object.entries(regulations.regulationsByPetType || {});
    if (petEntries.length === 0) {
      return res.status(404).send('No pet types available for this country.');
    }
    const petSlugToKey = {};
    petEntries.forEach(([k]) => { petSlugToKey[slugKey(k)] = k; });

    // Resolve requested pet; fall back to first
    const requestedSlug = slugKey(selectedPetTypeRaw) || slugKey(petEntries[0][0]);
    const petKey = petSlugToKey[requestedSlug] || petEntries[0][0];

    // Per-pet details for your cards
    const details = regulations.regulationsByPetType[petKey] || {};

    // Filter origin requirements by appliesTo (match on slug)
    const originReqs = [];
    const allOrigin = regulations.originRequirements || {};
    for (const [key, val] of Object.entries(allOrigin)) {
      const list = Array.isArray(val.appliesTo) ? val.appliesTo.map(slugKey) : [];
      const applies = list.length === 0 || list.includes(slugKey(petKey));
      if (applies) {
        originReqs.push({
          key,
          details: val.details || '',
          appliesTo: list
        });
      }
    }

    const safeCountry = regulations.destinationCountry;
    const pageUrl = `https://www.petvoyage.ai/country/${encodeURIComponent(safeCountry)}?petType=${encodeURIComponent(petKey)}`;

    const seoData = {
      regulations,
      // for UI controls (tabs/dropdowns)
      petTypes: petEntries.map(([k]) => ({ key: k, slug: slugKey(k) })),
      selectedPetType: petKey,

      // NEW: what your EJS cards need
      details,
      originReqs,

      title: `Pet Travel Requirements for ${safeCountry} - ${petKey}`,
      metaDescription: `Explore ${petKey} travel requirements for ${safeCountry}, including import rules, documentation, and vaccination policies.`,
      metaKeywords: `${safeCountry} pet travel ${petKey}, import ${petKey} ${safeCountry}, ${safeCountry} pet rules, travel with ${petKey}, pet documentation ${safeCountry}`,
      ogTitle: `Pet Import Regulations for ${safeCountry} - ${petKey}`,
      ogDescription: `Get pet import/export regulations for ${petKey}s traveling to ${safeCountry}.`,
      ogUrl: pageUrl,
      ogImage: '/images/pet-travel-map.jpg',
      twitterTitle: `Bringing Your ${petKey} to ${safeCountry}?`,
      twitterDescription: `Learn the latest ${petKey} travel requirements for ${safeCountry}.`
    };

    console.log("[SEO] Rendering showCountry with:", {
      country: safeCountry,
      selectedPetType: petKey,
      petTypes: seoData.petTypes.map(p => p.key),
      originReqsCount: originReqs.length
    });

    res.render('regulations/showCountry', seoData);
  } catch (err) {
    console.error("[ERROR] Failed to fetch country regulation:", err);
    res.status(500).send("Server Error");
  }
});



  

module.exports = router;
