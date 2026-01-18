// routes/sitemap.js
const express = require('express');
const Story = require('../models/story');
const Airline = require('../models/airline');
const CountryPetRegulation = require('../models/countryPetRegulationList');

const router = express.Router();

function absoluteOrigin(req) {
  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  if (base) return base;
  return (req.protocol + '://' + req.get('host')).replace(/\/+$/, '');
}

function xmlEscape(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

router.get('/sitemap.xml', async (req, res) => {
  try {
    const origin = absoluteOrigin(req);
    const nowIso = new Date().toISOString();

    // ✅ STATIC URLs (add all the pages you want indexed)
    const staticUrls = [
      { loc: `${origin}/`, changefreq: 'daily', priority: '1.0' },
      { loc: `${origin}/aboutus`, changefreq: 'monthly', priority: '0.8' },
      { loc: `${origin}/getCountryRegulationList`, changefreq: 'weekly', priority: '0.9' },
      { loc: `${origin}/regulations/searchFlights`, changefreq: 'weekly', priority: '0.9' },
      { loc: `${origin}/contactUs`, changefreq: 'yearly', priority: '0.5' },
      { loc: `${origin}/tips`, changefreq: 'monthly', priority: '0.7' },
      { loc: `${origin}/blog`, changefreq: 'weekly', priority: '0.8' },
      { loc: `${origin}/findAVet`, changefreq: 'weekly', priority: '0.9' },
      { loc: `${origin}/regulations/airlineList`, changefreq: 'weekly', priority: '0.8' }
    ];

    // ✅ BLOG URLs (dynamic)
    const stories = await Story.find({}, 'slug updatedAt createdAt').sort({ updatedAt: -1 }).lean();
    const blogUrls = stories.map(s => ({
      loc: `${origin}/blog/${s.slug || s._id}`,
      lastmod: new Date(s.updatedAt || s.createdAt || Date.now()).toISOString(),
      changefreq: 'weekly',
      priority: '0.7'
    }));

    // ✅ AIRLINE URLs (dynamic)
    const airlines = await Airline.find({}, 'slug updatedAt createdAt').lean();
    const airlineUrls = airlines
      .filter(a => a.slug)
      .map(a => ({
        loc: `${origin}/airlines/${a.slug}`,
        lastmod: new Date(a.updatedAt || a.createdAt || Date.now()).toISOString(),
        changefreq: 'weekly',
        priority: '0.8'
      }));

    // ✅ COUNTRY URLs (dynamic) -> /country/<Country>?petType=<type>
    // choose the pet types you support
    const PET_TYPES = ['dog', 'cat', 'bird', 'reptile', 'ferret', 'rabbit', 'rodent', 'fish', 'turtle', 'amphibian', 'hedgehog', 'other'];

    // Pull distinct country names from your regulations collection
    // (adjust field name if yours is different)
    const countries = await CountryPetRegulation.distinct('country');

    const countryUrls = [];
    for (const c of (countries || [])) {
      if (!c) continue;
      const encodedCountry = encodeURIComponent(c);

      for (const petType of PET_TYPES) {
        countryUrls.push({
          loc: `${origin}/country/${encodedCountry}?petType=${encodeURIComponent(petType)}`,
          lastmod: nowIso,          // or use updatedAt if your model has it
          changefreq: 'weekly',
          priority: '0.8'
        });
      }
    }

    // XML builder
    const toUrlXml = (u) => {
      const lastmod = u.lastmod || nowIso;
      return `
<url>
  <loc>${xmlEscape(u.loc)}</loc>
  <lastmod>${xmlEscape(lastmod)}</lastmod>
  ${u.changefreq ? `<changefreq>${xmlEscape(u.changefreq)}</changefreq>` : ''}
  <priority>${xmlEscape(u.priority || '0.5')}</priority>
</url>`;
    };

    const urlsXml = [
      ...staticUrls,
      ...blogUrls,
      ...airlineUrls,
      ...countryUrls
    ].map(toUrlXml).join('\n');

    res.type('application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlsXml}
</urlset>`);
  } catch (e) {
    console.error('[GET /sitemap.xml] err', e);
    res.status(500).send('Server error');
  }
});

module.exports = router;
