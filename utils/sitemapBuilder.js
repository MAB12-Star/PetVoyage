// utils/sitemapBuilder.js
const CountryRegulation = require('../models/countryPetRegulationList');
const Airline = require('../models/airline');

function slugKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Very small in-memory cache (optional but recommended)
let cache = { at: 0, ttlMs: 6 * 60 * 60 * 1000, data: null }; // 6 hours

async function buildSitemapData({ baseUrl, useCache = true } = {}) {
  const now = Date.now();
  if (useCache && cache.data && (now - cache.at) < cache.ttlMs) {
    return cache.data;
  }

  const b = (baseUrl || process.env.BASE_URL || 'https://www.petvoyage.ai').replace(/\/+$/, '');

  // Pull only fields we need
  const countryDocs = await CountryRegulation
    .find({}, { destinationCountry: 1, regulationsByPetType: 1, updatedAt: 1, createdAt: 1 })
    .lean();

  const airlineDocs = await Airline
    .find({}, { name: 1, slug: 1, updatedAt: 1, createdAt: 1 })
    .sort({ name: 1 })
    .lean();

  // Build “flat list” for XML
  const urls = [];

  // And “grouped list” for /sitemap page
  const countriesGrouped = [];

  for (const d of countryDocs) {
    const country = (d.destinationCountry || '').trim();
    if (!country) continue;

    const petTypes = d.regulationsByPetType ? Object.keys(d.regulationsByPetType) : [];
    const countryItem = { country, petTypes: [] };

    for (const petType of petTypes) {
      const petSlug = slugKey(petType);
      const loc = `${b}/country/${encodeURIComponent(country)}?petType=${encodeURIComponent(petSlug)}`;

      const lastmodDate = new Date(d.updatedAt || d.createdAt || Date.now());
      const lastmod = isNaN(lastmodDate) ? null : lastmodDate.toISOString();

      urls.push({ loc, lastmod, type: 'country', country, petType, petSlug });

      countryItem.petTypes.push({
        label: petType,
        slug: petSlug,
        url: loc
      });
    }

    // Sort pet types alphabetically
    countryItem.petTypes.sort((a, b) => a.label.localeCompare(b.label));
    countriesGrouped.push(countryItem);
  }

  // Sort countries alphabetically
  countriesGrouped.sort((a, b) => a.country.localeCompare(b.country));

  const airlinesGrouped = airlineDocs
    .filter(a => a.slug)
    .map(a => {
      const loc = `${b}/airlines/${encodeURIComponent(a.slug)}`;
      const lastmodDate = new Date(a.updatedAt || a.createdAt || Date.now());
      const lastmod = isNaN(lastmodDate) ? null : lastmodDate.toISOString();
      urls.push({ loc, lastmod, type: 'airline', airline: a.name, slug: a.slug });
      return { name: a.name, slug: a.slug, url: loc };
    });

  const data = {
    baseUrl: b,
    urls,
    grouped: {
      countries: countriesGrouped,
      airlines: airlinesGrouped
    }
  };

  cache = { ...cache, at: now, data };
  return data;
}

module.exports = { buildSitemapData };
