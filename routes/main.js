// routes/main.js
const express = require('express');
const router = express.Router();

// /regulations (base route)
router.get('/', (req, res) => {
  res.render('index', { currentPage: 'home' });
});

router.get('/newSearch', (req, res) => {
  console.log('/newSearch route hit');
  res.render('regulations/newSearch', { currentPage: 'newSearch' });
});



// /regulations/searchFlights
router.get('/searchFlights', (req, res) => {
  res.render('searchFlights', { currentPage: 'searchFlights' });
});

// /regulations/airlineList
router.get('/airlineList', (req, res) => {
  res.render('airlineList', { currentPage: 'airlineList' });
});

// These are NOT under /regulations
router.get('/findAVet', (req, res) => {
  res.render('findAVet', { currentPage: 'findAVet' });
});

router.get('/blog', (req, res) => {
  res.render('blog', { currentPage: 'blog' });
});

module.exports = router;
