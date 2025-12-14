const express = require('express');
const router = express.Router();

// Privacy Policy
router.get('/privacy', (req, res) => {
  res.render('legal/privacy', {
    title: 'Privacy Policy | PetVoyage',
    metaDescription: 'PetVoyage privacy policy describing how user data is collected, used, and protected.'
  });
});

// Data Deletion
router.get('/dataDeletion', (req, res) => {
  res.render('legal/dataDeletion', {
    title: 'User Data Deletion | PetVoyage',
    metaDescription: 'Instructions for requesting deletion of your PetVoyage user data.'
  });
});

module.exports = router;
