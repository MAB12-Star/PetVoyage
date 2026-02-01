// routes/pages.js
const express = require('express');
const router = express.Router();

// FAQ
router.get('/faq', (req, res) => {
  res.render('faq', {
    title: 'FAQ | PetVoyage.ai'
  });
});

// Terms
router.get('/terms', (req, res) => {
  res.render('terms', {
    title: 'Terms of Service | PetVoyage.ai'
  });
});

module.exports = router;
