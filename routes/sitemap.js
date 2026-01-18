// routes/sitemap.js
const express = require('express');
const Story = require('../models/story');

const router = express.Router();

function absoluteOrigin(req) {
  const origin = (req.protocol + '://' + req.get('host')) || 'https://www.petvoyage.ai';
  return origin.replace(/\/$/, '');
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

    // ✅ Your STATIC site URLs (add/remove whatever you want)
    const staticUrls = [
      { loc: `${origin}/`, changefreq: 'daily',   priority: '1.0' },
      { loc: `${origin}/aboutus`, changefreq: 'monthly', priority: '0.8' },
      { loc: `${origin}/getCountryRegulationList`, changefreq: 'weekly', priority: '0.9' },

      // Blog index + new post form (optional)
      { loc: `${origin}/blog`, changefreq: 'daily', priority: '0.8' }
      // { loc: `${origin}/blog/new`, changefreq: 'monthly', priority: '0.3' } // usually NOINDEX in real life
    ];

    // ✅ Blog posts (dynamic)
    const stories = await Story.find({}, 'slug updatedAt createdAt').sort({ updatedAt: -1 }).lean();
    const blogUrls = stories.map(s => {
      const slug = s.slug || s._id;
      const lastmod = new Date(s.updatedAt || s.createdAt || Date.now()).toISOString();
      return {
        loc: `${origin}/blog/${slug}`,
        lastmod,
        changefreq: 'weekly',
        priority: '0.7'
      };
    });

    // Build XML
    const nowIso = new Date().toISOString();

    const toUrlXml = (u) => {
      const lastmod = u.lastmod || nowIso;
      return `
  <url>
    <loc>${xmlEscape(u.loc)}</loc>
    <lastmod>${xmlEscape(lastmod)}</lastmod>
    <changefreq>${xmlEscape(u.changefreq || 'weekly')}</changefreq>
    <priority>${xmlEscape(u.priority || '0.5')}</priority>
  </url>`;
    };

    const urlsXml = staticUrls.map(toUrlXml).join('') + blogUrls.map(toUrlXml).join('');

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
