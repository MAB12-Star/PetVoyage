// routes/findAVet.js (or whatever file this router belongs to)
const express = require('express');
const router = express.Router();

// Route for Find a Vet page
router.get('/', (req, res) => {
  res.render('regulations/findAVet', {
    title: 'Find a Veterinarian Near You | PetVoyage',
    metaDescription: 'Search for veterinarians near your location for international health certificates, domestic health certificates, vaccinations, and pet travel readiness.',
    metaKeywords: 'find a vet, pet travel vet, international health certificate, domestic health certificate, certificate of veterinary inspection, CVI, USDA, pet vaccinations, rabies vaccine',
    ogTitle: 'Find a Vet for Pet Travel',
    ogDescription: 'Need a vet before flying with your pet? Find clinics that may help with travel certificates, vaccinations, and health checks.',
    ogUrl: 'https://www.petvoyage.ai/findAVet',
    ogImage: '/images/vet-checkup.jpg',
    twitterTitle: 'Find a Pet-Friendly Vet | PetVoyage',
    twitterDescription: 'Locate vets who may support pet travel requirements like health certificates and vaccinations.',
    twitterImage: '/images/vet-checkup.jpg'
  });
});

module.exports = router;
  