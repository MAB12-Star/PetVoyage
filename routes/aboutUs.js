const express = require('express');
const router = express.Router();

// Route for About Us page
router.get('/', (req, res) => {
  res.render('regulations/aboutUs', {
    title: 'About PetVoyage | Our Mission & Story',
    metaDescription: 'Learn about PetVoyage — our mission to simplify international pet travel. Meet the team and explore our values.',
    metaKeywords: 'about PetVoyage, who we are, pet travel company, pet travel help, meet the team, international pet travel',
    ogTitle: 'About Us - PetVoyage',
    ogDescription: 'Get to know PetVoyage. We’re here to help pet owners travel smarter with accurate airline and country regulations.',
    ogImage: '/images/about-us.jpg', // replace with real image if needed
    ogUrl: 'https://www.petvoyage.ai/regulations/aboutUs',
    twitterTitle: 'Meet the PetVoyage Team',
    twitterDescription: 'Helping you travel the world with your pets. Learn who we are and why we built PetVoyage.',
    twitterImage: '/images/about-us.jpg'
  });
});

module.exports = router;
