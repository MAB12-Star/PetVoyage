const express = require('express');
const guides = require('../content/guides.json');
const router = express.Router();
const base = 'https://www.petvoyage.ai';
router.get('/', (req, res) => res.render('guides/index', {
  guides, title: 'Pet Travel Planning Guides | PetVoyage',
  metaDescription: 'Practical pet travel guides for route research, carrier questions, veterinary conversations and packing.',
  canonicalUrl: `${base}/guides`, ogUrl: `${base}/guides`
}));
router.get('/:slug', (req, res, next) => {
  const guide = guides.find(item => item.slug === req.params.slug);
  if (!guide) return next();
  const canonicalUrl = `${base}/guides/${guide.slug}`;
  res.render('guides/show', {guide, guides, title: `${guide.title} | PetVoyage`, metaDescription: guide.description, canonicalUrl, ogUrl: canonicalUrl});
});
module.exports = router;
