// routes/pages.js
const express = require('express');
const router = express.Router();

// FAQ
router.get('/faq', (req, res) => {
  res.render('faq', {
    title: 'Pet Travel FAQ | PetVoyage',
    metaDescription: 'Quick answers about international pet travel regulations, airline pet policies, pet carrier rules, rabies requirements, health certificates, and more.',
    metaKeywords: 'pet travel faq, airline pet policies, pet import requirements, rabies titer test, pet carrier requirements, international pet travel rules',
    ogTitle: 'Pet Travel FAQ | PetVoyage',
    ogDescription: 'Find quick answers about pet travel regulations, airline pet policies, health certificates, carrier rules, and import requirements.',
    ogImage: '/images/PetVoyageLogo.png',
    ogUrl: 'https://www.petvoyage.ai/faq',
    twitterTitle: 'Pet Travel FAQ | PetVoyage',
    twitterDescription: 'Answers to common questions about flying with pets and international pet import rules.',
    twitterImage: '/images/PetVoyageLogo.png',
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What are the general pet travel regulations for international trips?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Most countries require an ISO-compliant microchip, current rabies vaccination, and a health certificate signed by an accredited veterinarian. Some destinations also require rabies titer testing, waiting periods, or quarantine."
          }
        },
        {
          "@type": "Question",
          "name": "What are common airline pet carrier requirements?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "In-cabin carriers are usually ventilated, leak-proof, and sized to fit under the seat. Cargo crates usually need rigid construction, secure fasteners, ventilation, and enough room for the pet to stand, turn, and lie down."
          }
        },
        {
          "@type": "Question",
          "name": "Can I fly with multiple pets on one ticket?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Most airlines allow one in-cabin pet per passenger, though some allow two small compatible pets in one carrier. Cargo policies vary and often require separate crates and documentation."
          }
        }
      ]
    }
  });
});

// Terms
router.get('/terms', (req, res) => {
  res.render('terms', {
    title: 'Terms of Service | PetVoyage',
    metaDescription: 'Read the PetVoyage Terms of Service, including content limitations, travel regulation disclaimers, third-party links, and user responsibilities.',
    metaKeywords: 'PetVoyage terms, terms of service, pet travel regulations disclaimer, airline pet policies disclaimer',
    ogTitle: 'Terms of Service | PetVoyage',
    ogDescription: 'Understand how to use PetVoyage, plus travel regulation disclaimers and user responsibilities.',
    ogImage: '/images/PetVoyageLogo.png',
    ogUrl: 'https://www.petvoyage.ai/terms',
    twitterTitle: 'Terms of Service | PetVoyage',
    twitterDescription: 'Read PetVoyage terms, disclaimers, and user responsibilities.',
    twitterImage: '/images/PetVoyageLogo.png'
  });
});

module.exports = router;
