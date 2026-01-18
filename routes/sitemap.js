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

// Optional: keep sitemap from exploding if you have huge collections
const MAX_URLS = Number(process.env.SITEMAP_MAX_URLS || 45000);

router.get('/sitemap.xml', async (req, res) => {
  try {
    const origin = absoluteOrigin(req);
    const nowIso = new Date().toISOString();

    // ✅ STATIC URLs (add/remove what you want indexed)
    // NOTE: Do NOT include your Shopify domain here; keep that as a separate sitemap submission.
    const staticUrls = [
      { loc: `${origin}/`, changefreq: 'daily', priority: '1.0' },
      { loc: `${origin}/aboutus`, changefreq: 'monthly', priority: '0.8' },

      // Country + Flights + Airlines
      { loc: `${origin}/getCountryRegulationList`, changefreq: 'weekly', priority: '0.9' },
      { loc: `${origin}/flights/searchFlights`, changefreq: 'weekly', priority: '0.9' }, // ✅ matches your nav
      { loc: `${origin}/regulations/airlineList`, changefreq: 'weekly', priority: '0.8' },

      // Content pages
      { loc: `${origin}/tips`, changefreq: 'monthly', priority: '0.7' },
      { loc: `${origin}/findAVet`, changefreq: 'weekly', priority: '0.9' },
      { loc: `${origin}/blog`, changefreq: 'weekly', priority: '0.8' },

      // Trust/legal (good for SEO + trust)
      { loc: `${origin}/contactUs`, changefreq: 'yearly', priority: '0.5' },
      { loc: `${origin}/privacy`, changefreq: 'yearly', priority: '0.3' },
      { loc: `${origin}/dataDeletion`, changefreq: 'yearly', priority: '0.3' }
      // { loc: `${origin}/terms`, changefreq: 'yearly', priority: '0.3' }, // if you have it
    ];

    // ✅ BLOG URLs (dynamic)
    const stories = await Story.find({}, 'slug updatedAt createdAt')
      .sort({ updatedAt: -1 })
      .lean();

    const blogUrls = (stories || []).map(s => ({
      loc: `${origin}/blog/${s.slug || s._id}`,
      lastmod: new Date(s.updatedAt || s.createdAt || Date.now()).toISOString(),
      changefreq: 'weekly',
      priority: '0.7'
    }));

    // ✅ AIRLINE URLs (dynamic)
    const airlines = await Airline.find({}, 'slug updatedAt createdAt').lean();
    const airlineUrls = (airlines || [])
      .filter(a => a.slug)
      .map(a => ({
        loc: `${origin}/airlines/${a.slug}`,
        lastmod: new Date(a.updatedAt || a.createdAt || Date.now()).toISOString(),
        changefreq: 'weekly',
        priority: '0.8'
      }));

   // ✅ COUNTRY URLs (dynamic) — per-country petTypes only (NO global union)
const countryDocs = await CountryPetRegulation
  .find({}, 'destinationCountry regulationsByPetType updatedAt createdAt')
  .lean();

// Normalize pet type keys so you don’t get Dog + dog + Dogs + "Other Pets" duplicates
function normalizePetType(raw) {
  if (!raw) return null;
  const t = String(raw).trim();

  // lower for comparisons
  const low = t.toLowerCase();

  // common normalizations
  if (low === 'dogs') return 'dog';
  if (low === 'cats') return 'cat';
  if (low === 'birds') return 'bird';
  if (low === 'ferrets') return 'ferret';
  if (low === 'rabbits') return 'rabbit';
  if (low === 'rodents') return 'rodent';
  if (low === 'reptiles') return 'reptile';
  if (low === 'turtles') return 'turtle';
  if (low === 'hedgehogs') return 'hedgehog';

  // your UI tab shows "Other Pets" — decide ONE canonical query param
  // pick "otherPets" (matches your screenshot button label) OR "other"
  if (low === 'other pets' || low === 'otherpets') return 'otherPets';

  // keep custom admin-created pet types, but normalize spaces a bit
  // (optional) if you want to allow "Guinea Pig" but store it as "guinea_pig"
  if (low === 'guinea pig') return 'guinea_pig';

  // otherwise keep as-is
  return t;
}

const countryUrls = [];
const seen = new Set();

for (const doc of (countryDocs || [])) {
  const country = (doc.destinationCountry || '').trim();
  if (!country) continue;

  const encodedCountry = encodeURIComponent(country);
  const lastmod = new Date(doc.updatedAt || doc.createdAt || Date.now()).toISOString();

  // Only pet types that exist on THIS country doc
  const petMap = doc.regulationsByPetType || {};
  const rawPetTypes = Object.keys(petMap);

  for (const raw of rawPetTypes) {
    const petType = normalizePetType(raw);
    if (!petType) continue;

    const url = `${origin}/country/${encodedCountry}?petType=${encodeURIComponent(petType)}`;
    if (seen.has(url)) continue;
    seen.add(url);

    countryUrls.push({
      loc: url,
      lastmod,
      changefreq: 'weekly',
      priority: '0.8'
    });
  }
}


    // ✅ Combine + cap (avoid oversize)
    const allUrls = [
      ...staticUrls,
      ...blogUrls,
      ...airlineUrls,
      ...countryUrls
    ].slice(0, MAX_URLS);

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

    const urlsXml = allUrls.map(toUrlXml).join('\n');

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
