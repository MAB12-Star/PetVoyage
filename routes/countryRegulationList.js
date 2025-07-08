// File: routes/countryRegulationList.js
const express = require('express');
const router = express.Router();
const CountryRegulation = require("../models/countryPetRegulationList");



// GET route to render the search page with a list of countries
router.get('/getCountryRegulationList', async (req, res) => {
    try {
      const countries = await CountryRegulation.find().distinct('destinationCountry');
      console.log("[LOG] Retrieved countries for dropdown:", countries);  //
  
      res.render('regulations/countryRegulationList', { countries });
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
  
      // Convert Map to plain object if needed
      if (regulations.regulationsByPetType instanceof Map || typeof regulations.regulationsByPetType === 'object') {
        regulations.regulationsByPetType = Object.fromEntries(
          Object.entries(regulations.regulationsByPetType).filter(
            ([key]) => !key.startsWith('$_')
          )
        );
      }
  
      res.render('regulations/showCountry', { regulations });
    } catch (err) {
      console.error("[ERROR] Failed to fetch country regulation:", err);
      res.status(500).send("Server Error");
    }
  });
  

module.exports = router;
