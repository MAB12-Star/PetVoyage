const express = require('express');
const router = express.Router();

// Route for Tips page
router.get('/', (req, res) => {
    res.render('regulations/tips', {
        title: 'Pet Travel Tips – Prepare Your Pet for Safe Flights',
        metaDescription: 'Explore practical tips for traveling with pets. Learn how to prepare crates, manage pet anxiety, and ensure compliance with airline rules.',
        metaKeywords: 'pet travel tips, crate training, pet anxiety, flying with pets, airline pet prep, pet travel guide',
        ogTitle: 'Top Tips for Flying with Pets – PetVoyage',
        ogDescription: 'Everything you need to know to fly safely and smoothly with your pet. Trusted tips for pet travelers.',
        ogUrl: 'https://www.petvoyage.ai/tips',
        ogImage: '/images/pet-travel-cover.jpg',
        twitterTitle: 'Top Tips for Flying with Pets – PetVoyage',
        twitterDescription: 'Expert advice and actionable tips for pet air travel. Learn how to prepare and fly stress-free with your furry companion.',
        twitterImage: '/images/pet-travel-cover.jpg'
    });
});

module.exports = router;

