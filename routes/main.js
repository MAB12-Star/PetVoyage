const express = require('express');
const router = express.Router();

// /regulations (Landing/Home)
router.get('/', (req, res) => {
  res.render('index', {
    currentPage: 'home',
    title: 'PetVoyage | International Pet Travel Resource',
    metaDescription: 'Find pet travel regulations by country and airline. Plan your journey with your pet using our free travel compliance guide.',
    metaKeywords: 'pet travel, travel with pets, pet airline policies, country pet regulations, flying with pets',
    ogTitle: 'PetVoyage: Free International Pet Travel Guide',
    ogDescription: 'Plan pet travel with confidence. Find airline and country-specific rules for cats, dogs, and service animals.',
    ogUrl: 'https://www.petvoyage.ai/',
    ogImage: '/images/pet-travel-cover.jpg',
    twitterTitle: 'PetVoyage | Plan Pet Travel Easily',
    twitterDescription: 'Your guide to pet-friendly travel rules, policies, and documentation.',
    twitterImage: '/images/pet-travel-cover.jpg'
  });
});

// /regulations/newSearch
router.get('/newSearch', (req, res) => {
  console.log('/newSearch route hit');
  res.render('regulations/newSearch', {
    currentPage: 'newSearch',
    title: 'Start a New Search | Pet Travel Planner | PetVoyage',
    metaDescription: 'Choose your destination and pet type to get personalized import/export regulations instantly.',
    metaKeywords: 'pet travel search, country pet rules, pet import, export pets, pet documentation',
    ogTitle: 'New Search – Pet Travel Planner | PetVoyage',
    ogDescription: 'Select your country and animal type to begin your pet travel research.',
    ogUrl: 'https://www.petvoyage.ai/newSearch',
    ogImage: '/images/pet-search.jpg',
    twitterTitle: 'New Pet Travel Search | PetVoyage',
    twitterDescription: 'Search global pet import/export rules in seconds.',
    twitterImage: '/images/pet-search.jpg'
  });
});

// /regulations/searchFlights
router.get('/searchFlights', (req, res) => {
  res.render('searchFlights', {
    currentPage: 'searchFlights',
    title: 'Search Flights with Your Pet | PetVoyage',
    metaDescription: 'Find flights from nearby airports and compare airline pet policies. Ensure a safe, pet-friendly trip.',
    metaKeywords: 'pet flights, flights with pets, airline pet policy, pet air travel, international travel pets',
    ogTitle: 'Search Pet-Friendly Flights | PetVoyage',
    ogDescription: 'Compare pet travel policies by airline and route. Plan a pet-safe journey.',
    ogUrl: 'https://www.petvoyage.ai/searchFlights',
    ogImage: '/images/movetocdmx.jpg',
    twitterTitle: 'Flight Search for Pet Travelers | PetVoyage',
    twitterDescription: 'Search and compare airlines to find the best flight for you and your pet.',
    twitterImage: '/images/movetocdmx.jpg'
  });
});

// /regulations/airlineList
router.get('/airlineList', (req, res) => {
  res.render('airlineList', {
    currentPage: 'airlineList',
    title: 'Airline Pet Policies Directory | PetVoyage',
    metaDescription: 'Browse 140+ airlines and learn their pet policies for in-cabin, cargo, service animals, and documentation requirements.',
    metaKeywords: 'airline pet policies, pet-friendly airlines, fly with pets, airline dog rules, service animal flight',
    ogTitle: 'Complete Airline Pet Travel Guide | PetVoyage',
    ogDescription: 'Find the right airline for your pet. Compare policies and plan with confidence.',
    ogUrl: 'https://www.petvoyage.ai/airlineList',
    ogImage: '/images/airlines-banner.jpg',
    twitterTitle: 'Browse Airline Pet Rules | PetVoyage',
    twitterDescription: 'See which airlines best support your pet’s needs.',
    twitterImage: '/images/airlines-banner.jpg'
  });
});

// /findAVet (outside regulations)
router.get('/findAVet', (req, res) => {
  res.render('findAVet', {
    currentPage: 'findAVet',
    title: 'Find a Veterinarian Near You | PetVoyage',
    metaDescription: 'Search for veterinarians to get required health certificates and vaccinations before flying with your pet.',
    metaKeywords: 'pet travel vet, animal health certificate, find a vet, pet vaccinations, vet locator',
    ogTitle: 'Locate a Vet for Pet Travel | PetVoyage',
    ogDescription: 'Ensure your pet is travel-ready. Use PetVoyage to find nearby veterinarians.',
    ogUrl: 'https://www.petvoyage.ai/findAVet',
    ogImage: '/images/vet-checkup.jpg',
    twitterTitle: 'Find a Pet Travel Vet | PetVoyage',
    twitterDescription: 'Locate a vet for international documentation, vaccinations, and health checks.',
    twitterImage: '/images/vet-checkup.jpg'
  });
});

// /blog (outside regulations)
router.get('/blog', (req, res) => {
  res.render('blog', {
    currentPage: 'blog',
    title: 'Pet Travel Blog | Tips, Stories & Guides | PetVoyage',
    metaDescription: 'Read personal experiences, airline insights, and travel tips for flying with pets internationally.',
    metaKeywords: 'pet travel stories, pet tips, flying with pets, travel guide pets, blog international pets',
    ogTitle: 'Pet Travel Blog | PetVoyage',
    ogDescription: 'Get expert advice, airline updates, and heartwarming pet travel stories.',
    ogUrl: 'https://www.petvoyage.ai/blog',
    ogImage: '/images/blog-banner.jpg',
    twitterTitle: 'Read Pet Travel Stories | PetVoyage Blog',
    twitterDescription: 'The best travel blog for pet lovers flying worldwide.',
    twitterImage: '/images/blog-banner.jpg'
  });
});

module.exports = router;
