// routes/sitemap.js
const express = require('express');
const router = express.Router();

const Story = require('../models/story');
const Airline = require('../models/airline');
const CountryPetRegulation = require('../models/countryPetRegulationList');

// Optional: keep sitemap from exploding if you have huge collections
const MAX_URLS = Number(process.env.SITEMAP_MAX_URLS || 45000);

// Optional: simple in-memory cache so sitemap endpoints are fast
const CACHE_TTL_MS = Number(process.env.SITEMAP_CACHE_TTL_MS || 6 * 60 * 60 * 1000); // 6h default
let cache = { at: 0, data: null };

function absoluteOrigin(req) {
  const env = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  if (env) return env;

  // Otherwise force https (sitemaps should always be canonical)
  return ('https://' + req.get('host')).replace(/\/+$/, '');
}

function xmlEscape(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Normalize pet type keys so you don’t get Dog + dog + Dogs + "Other Pets" duplicates
function normalizePetType(raw) {
  if (!raw) return null;
  const t = String(raw).trim();
  const low = t.toLowerCase();

  if (low === 'dogs') return 'dog';
  if (low === 'cats') return 'cat';
  if (low === 'birds') return 'bird';
  if (low === 'ferrets') return 'ferret';
  if (low === 'rabbits') return 'rabbit';
  if (low === 'rodents') return 'rodent';
  if (low === 'reptiles') return 'reptile';
  if (low === 'turtles') return 'turtle';
  if (low === 'hedgehogs') return 'hedgehog';

  // Pick ONE canonical param for “Other Pets”
  if (low === 'other pets' || low === 'otherpets') return 'otherPets';

  if (low === 'guinea pig') return 'guinea_pig';

  return t; // keep custom admin-created types
}

async function buildSitemapData(req) {
  const now = Date.now();
  if (cache.data && (now - cache.at) < CACHE_TTL_MS) return cache.data;

  const origin = absoluteOrigin(req);
  const nowIso = new Date().toISOString();

  // ✅ STATIC URLs
  const staticUrls = [
    { loc: `${origin}/`, changefreq: 'daily', priority: '1.0' },
    { loc: `${origin}/aboutus`, changefreq: 'monthly', priority: '0.8' },

    { loc: `${origin}/getCountryRegulationList`, changefreq: 'weekly', priority: '0.9' },
    { loc: `${origin}/flights/searchFlights`, changefreq: 'weekly', priority: '0.9' },
    { loc: `${origin}/regulations/airlineList`, changefreq: 'weekly', priority: '0.8' },

    { loc: `${origin}/tips`, changefreq: 'monthly', priority: '0.7' },
    { loc: `${origin}/findAVet`, changefreq: 'weekly', priority: '0.9' },
    { loc: `${origin}/blog`, changefreq: 'weekly', priority: '0.8' },

    { loc: `${origin}/contactUs`, changefreq: 'yearly', priority: '0.5' },
    { loc: `${origin}/privacy`, changefreq: 'yearly', priority: '0.3' },
    { loc: `${origin}/dataDeletion`, changefreq: 'yearly', priority: '0.3' },

    // ✅ Human sitemap page should also be indexable (up to you)
    { loc: `${origin}/sitemap`, changefreq: 'weekly', priority: '0.4' }
  ];

  // ✅ BLOG URLs
  const stories = await Story.find({}, 'slug title updatedAt createdAt')
    .sort({ updatedAt: -1 })
    .lean();

  const blogUrls = (stories || []).map(s => ({
    loc: `${origin}/blog/${s.slug || s._id}`,
    lastmod: new Date(s.updatedAt || s.createdAt || Date.now()).toISOString(),
    changefreq: 'weekly',
    priority: '0.7',
    title: s.title || null
  }));

  // ✅ AIRLINE URLs
  const airlines = await Airline.find({}, 'name slug updatedAt createdAt')
    .sort({ name: 1 })
    .lean();

  const airlineUrls = (airlines || [])
    .filter(a => a.slug)
    .map(a => ({
      loc: `${origin}/airlines/${a.slug}`,
      lastmod: new Date(a.updatedAt || a.createdAt || Date.now()).toISOString(),
      changefreq: 'weekly',
      priority: '0.8',
      name: a.name || a.slug
    }));

  // ✅ COUNTRY URLs — per-country petTypes only
  const countryDocs = await CountryPetRegulation
    .find({}, 'destinationCountry regulationsByPetType updatedAt createdAt')
    .sort({ destinationCountry: 1 })
    .lean();

  const countryUrls = [];
  const countriesForHtml = []; // grouped list for /sitemap
  const seen = new Set();

  for (const doc of (countryDocs || [])) {
    const country = (doc.destinationCountry || '').trim();
    if (!country) continue;

    const encodedCountry = encodeURIComponent(country);
    const lastmod = new Date(doc.updatedAt || doc.createdAt || Date.now()).toISOString();

    const petMap = doc.regulationsByPetType || {};
    const rawPetTypes = Object.keys(petMap);

    const petLinks = [];

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
        priority: '0.8',
        country,
        petType
      });

      petLinks.push({ label: raw, petType, url });
    }

    if (petLinks.length) {
      petLinks.sort((a, b) => a.label.localeCompare(b.label));
      countriesForHtml.push({ country, links: petLinks });
    }
  }

  // ✅ Combine + cap
  const allUrls = [
    ...staticUrls,
    ...blogUrls,
    ...airlineUrls,
    ...countryUrls
  ].slice(0, MAX_URLS);

  const data = {
    origin,
    nowIso,
    urls: allUrls,
    grouped: {
      countries: countriesForHtml,
      airlines: airlineUrls,
      stories: blogUrls
    }
  };

  cache = { at: now, data };
  return data;
}

/* ---------------- XML SITEMAP ---------------- */
router.get('/sitemap.xml', async (req, res) => {
  try {
    const { urls, nowIso } = await buildSitemapData(req);

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

    const urlsXml = urls.map(toUrlXml).join('\n');

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

/* ---------------- HTML SITEMAP (TOC) ---------------- */
router.get('/sitemap', async (req, res) => {
  try {
    const { grouped, origin } = await buildSitemapData(req);

    res.render('sitemap', {
      title: 'Site Map | PetVoyage',
      origin,
      countries: grouped.countries,
      airlines: grouped.airlines,
      stories: grouped.stories
    });
  } catch (e) {
    console.error('[GET /sitemap] err', e);
    res.status(500).send('Server error');
  }
});

module.exports = router;
