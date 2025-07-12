const express = require('express');
const router = express.Router();

// Route for Blog page
router.get('/', (req, res) => {
  res.render('regulations/blog', {
    title: 'Pet Travel Blog | Tips & Stories | PetVoyage',
    metaDescription: 'Explore expert tips, personal stories, and advice about traveling internationally with pets. Stay informed with the PetVoyage blog.',
    metaKeywords: 'pet travel blog, pet travel tips, flying with pets, international pet travel, pet travel stories, airline pet advice',
    ogTitle: 'Pet Travel Blog | PetVoyage',
    ogDescription: 'Learn how to travel smart with your pet. Discover airline updates, personal experiences, and pet travel guides.',
    ogImage: '/images/blog-banner.jpg',
    ogUrl: 'https://www.petvoyage.ai/blog',
    twitterTitle: 'PetVoyage Blog | Pet Travel Insights',
    twitterDescription: 'Stay updated with the latest tips and stories about traveling internationally with pets.',
    twitterImage: '/images/blog-banner.jpg'
  });
});

module.exports = router;
