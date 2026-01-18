// File: routes/countryRegulationList.js
const express = require('express');
const router = express.Router();
const CountryRegulation = require("../models/countryPetRegulationList");

// ✅ Import your middleware FILE (not folder)
// If your middleware is at: /middleware.js -> use "../middleware"
// If your middleware is at: /middleware/index.js -> use "../middleware"
const mw = require('../middleware'); // <-- CHANGE THIS PATH if needed

/* ---------------- Helpers ---------------- */
function escapeRegex(str = '') {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function slugKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* ---------------- LIST PAGE ---------------- */
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

/* ---------------- SHOW COUNTRY ---------------- */
/**
 * ✅ Attach Ads middleware HERE so showCountry.ejs has:
 *   - res.locals.getAd()
 *   - res.locals.adsByPlacement
 *
 * If attachAds is not mounted, getAd will be undefined and nothing renders.
 */
router.get('/country/:country', mw.attachAds, async (req, res) => {
  try {
    // ✅ decode + trim to avoid mismatch from URL encoding
    const rawParam = req.params.country || '';
    const countryParam = decodeURIComponent(rawParam).trim();

    const selectedPetTypeRaw = (req.query.petType || '').trim();

    // ✅ case-insensitive exact match
    const regulations = await CountryRegulation.findOne({
      destinationCountry: new RegExp(`^${escapeRegex(countryParam)}$`, 'i')
    }).lean();

    if (!regulations) {
      console.error("[ERROR] No regulations found for:", countryParam);
      return res.status(404).send('Country regulations not found.');
    }

    // Strip any transient keys (your existing cleanup)
    if (typeof regulations.regulationsByPetType === 'object' && regulations.regulationsByPetType) {
      regulations.regulationsByPetType = Object.fromEntries(
        Object.entries(regulations.regulationsByPetType).filter(([key]) => !key.startsWith('$_'))
      );
    }

    const petEntries = Object.entries(regulations.regulationsByPetType || {});
    if (petEntries.length === 0) {
      return res.status(404).send('No pet types available for this country.');
    }

    // Build a slug->originalKey map
    const petSlugToKey = {};
    petEntries.forEach(([k]) => { petSlugToKey[slugKey(k)] = k; });

    // Resolve requested pet; fall back to first
    const defaultPetKey = petEntries[0][0];
    const requestedSlug = slugKey(selectedPetTypeRaw) || slugKey(defaultPetKey);
    const petKey = petSlugToKey[requestedSlug] || defaultPetKey;

    const petLabel = String(petKey || '').trim();

    // ✅ Canonical URL should always use the slug version (lowercase, hyphenated)
    const canonicalPetType = slugKey(petKey);

    // ✅ If user requested a non-canonical petType (Dog, Dogs, Dog & Cat, etc) redirect to canonical
    if (selectedPetTypeRaw && slugKey(selectedPetTypeRaw) !== canonicalPetType) {
      const safeCountry = regulations.destinationCountry;
      return res.redirect(
        301,
        `/country/${encodeURIComponent(safeCountry)}?petType=${encodeURIComponent(canonicalPetType)}`
      );
    }

    // Per-pet details for your cards
    const details = (regulations.regulationsByPetType && regulations.regulationsByPetType[petKey]) || {};

    // Filter origin requirements by appliesTo (match on slug)
    const originReqs = [];
    const allOrigin = regulations.originRequirements || {};
    for (const [key, val] of Object.entries(allOrigin)) {
      const list = Array.isArray(val?.appliesTo) ? val.appliesTo.map(slugKey) : [];
      const applies = list.length === 0 || list.includes(slugKey(petKey));
      if (applies) {
        originReqs.push({
          key,
          details: val?.details || '',
          appliesTo: list
        });
      }
    }

    const safeCountry = regulations.destinationCountry;
    const baseUrl = (process.env.BASE_URL || 'https://www.petvoyage.ai').replace(/\/+$/, '');
    const pageUrl = `${baseUrl}/country/${encodeURIComponent(safeCountry)}?petType=${encodeURIComponent(canonicalPetType)}`;

    const seoData = {
      regulations,

      // ✅ IMPORTANT: send the Mongo _id so your Save button can POST it
      regulationId: regulations._id,

      // for UI controls (tabs/dropdowns)
      petTypes: petEntries.map(([k]) => ({ key: k, slug: slugKey(k) })),
      selectedPetType: petKey,

      // what your EJS cards need
      details,
      originReqs,

      title: `Pet Travel Requirements for ${safeCountry} - ${petLabel}`,
      metaDescription: `Explore ${petLabel} travel requirements for ${safeCountry}, including import rules, documentation, and vaccination policies.`,
      metaKeywords: `${safeCountry} pet travel ${petLabel}, import ${petLabel} ${safeCountry}, ${safeCountry} pet rules, travel with ${petLabel}, pet documentation ${safeCountry}`,
      ogTitle: `Pet Import Regulations for ${safeCountry} - ${petLabel}`,
      ogDescription: `Get pet import/export regulations for ${petLabel} traveling to ${safeCountry}.`,
      ogUrl: pageUrl,
      ogImage: '/images/pet-travel-map.jpg',
      twitterTitle: `Bringing Your ${petLabel} to ${safeCountry}?`,
      twitterDescription: `Learn the latest ${petLabel} travel requirements for ${safeCountry}.`,
      twitterImage: '/images/pet-travel-map.jpg'
    };

    console.log("[SEO] Rendering showCountry with:", {
      country: safeCountry,
      selectedPetType: petKey,
      canonicalPetType,
      petTypes: seoData.petTypes.map(p => p.key),
      originReqsCount: originReqs.length,
      regulationId: String(regulations._id),
      hasGetAd: typeof res.locals.getAd === 'function',
      placements: Object.keys(res.locals.adsByPlacement || {})
    });

    res.render('regulations/showCountry', seoData);
  } catch (err) {
    console.error("[ERROR] Failed to fetch country regulation:", err);
    res.status(500).send("Server Error");
  }
});


module.exports = router;
