const express = require('express');
const router = express.Router();

// Route for Find a Vet page
router.get('/', (req, res) => {
  res.render('regulations/findAVet', {
    title: 'Find a Veterinarian Near You | PetVoyage',
    metaDescription: 'Search for veterinarians near your location for health certificates, vaccinations, and pet travel readiness. Especially useful for international pet travel.',
    metaKeywords: 'find a vet, pet travel vet, animal health certificate, vet near me, pet vaccinations, pet health check, international travel pets',
    ogTitle: 'Find a Vet for Pet Travel',
    ogDescription: 'Need a vet before flying internationally with your pet? Use PetVoyage to find veterinarians who can help with documentation and health checks.',
    ogUrl: 'https://www.petvoyage.ai/findAVet',
    ogImage: '/images/vet-checkup.jpg',
    twitterTitle: 'Find a Pet-Friendly Vet | PetVoyage',
    twitterDescription: 'Locate vets who specialize in pet travel requirements like health checks, vaccinations, and certificates.',
    twitterImage: '/images/vet-checkup.jpg'
  });
});

module.exports = router;
