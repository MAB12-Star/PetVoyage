// routes/blog.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const Airline = require('../models/airline');
const Story = require('../models/story');
const { ensureAuth, ensureOwner } = require('../middleware');

const router = express.Router();

/* ───────────────────────── Upload dirs ───────────────────────── */
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const FULL_DIR   = path.join(UPLOAD_DIR, 'full');
const THUMB_DIR  = path.join(UPLOAD_DIR, 'thumb');
for (const dir of [UPLOAD_DIR, FULL_DIR, THUMB_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/* ───────────────────────── Multer (memory) ───────────────────────── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 }, // 8MB, max 6 files
  fileFilter: (_, file, cb) => {
    const ok = /jpeg|jpg|png|webp|gif/i.test(file.mimetype);
    cb(ok ? null : new Error('Only JPG/PNG/WEBP/GIF images allowed'), ok);
  }
});

/* ───────────────────────── Helpers ───────────────────────── */
async function processImageBuffer(buf, baseNameNoExt) {
  const img = sharp(buf).rotate(); // normalize orientation

  // Full size
  const fullName = `${baseNameNoExt}.webp`;
  const fullPath = path.join(FULL_DIR, fullName);
  await img
    .clone()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(fullPath);

  // Thumb
  const thumbName = `${baseNameNoExt}_thumb.webp`;
  const thumbPath = path.join(THUMB_DIR, thumbName);
  await img
    .clone()
    .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(thumbPath);

  return { url: `/uploads/full/${fullName}`, thumbUrl: `/uploads/thumb/${thumbName}` };
}

const isObjectId = (s = '') => /^[0-9a-fA-F]{24}$/.test(String(s));

const slugify = (s = '') =>
  s.toString()
   .toLowerCase()
   .trim()
   .replace(/&/g, '-and-')
   .replace(/[^a-z0-9]+/g, '-')
   .replace(/^-+|-+$/g, '')
   .slice(0, 80);

async function uniqueSlugFromTitle(title = '') {
  const base = slugify(title) || 'story';
  let candidate = base;
  let n = 0;
  // eslint-disable-next-line no-await-in-loop
  while (await Story.exists({ slug: candidate })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

function stripHtml(html = '') {
  return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function absoluteUrl(req, relPath = '') {
  const origin = (req.protocol + '://' + req.get('host')) || 'https://www.petvoyage.ai';
  if (/^https?:\/\//i.test(relPath)) return relPath; // already absolute
  return origin.replace(/\/+$/, '') + '/' + String(relPath).replace(/^\/+/, '');
}

// 🔎 Helper: get story by slug or ObjectId (used by ensureOwner in edit/update/delete)
async function findStoryByParam(req) {
  const key = req.params.id || req.params.slug || req.params.slugOrId;
  if (!key) return null;
  const query = isObjectId(key) ? { _id: key } : { slug: key };
  return Story.findOne(query);
}

/* =========================
   BLOG INDEX (list)
   ========================= */
router.get('/', async (req, res) => {
  const stories = await Story.find({})
    .populate('author', 'displayName email')
    .sort({ createdAt: -1 })
    .lean();

  // Build a lookup from airline name -> slug (for linking on index if needed)
  let airlineByName = {};
  try {
    const airlines = await Airline.find({}, 'name slug').lean();
    airlineByName = Object.fromEntries(
      airlines.map(a => [String(a.name).toLowerCase(), a.slug])
    );
  } catch (e) {
    console.warn('[blog index] airline list failed:', e.message);
  }

  res.render('regulations/blog', {
    title: 'Pet Travel Blog | Tips & Stories | PetVoyage',
    metaDescription:
      'Explore expert tips, personal stories, and advice about traveling internationally with pets. Stay informed with the PetVoyage blog.',
    metaKeywords:
      'pet travel blog, pet travel tips, flying with pets, international pet travel, pet travel stories, airline pet advice',
    ogTitle: 'Pet Travel Blog | PetVoyage',
    ogDescription:
      'Learn how to travel smart with your pet. Discover airline updates, personal experiences, and pet travel guides.',
    ogImage: '/images/blog-banner.jpg',
    ogUrl: absoluteUrl(req, '/blog'),
    twitterTitle: 'PetVoyage Blog | Pet Travel Insights',
    twitterDescription:
      'Stay updated with the latest tips and stories about traveling internationally with pets.',
    twitterImage: '/images/blog-banner.jpg',
    stories,
    airlineByName,   // used by index EJS to link badges
    user: req.user || null
  });
});

/* =========================
   NEW STORY (form)
   ========================= */
router.get('/new', ensureAuth, async (req, res) => {
  try {
    const airlines = await Airline.find({}, 'name slug').sort({ name: 1 }).lean();
    res.render('regulations/blog_new', {
      user: req.user,
      story: {},
      airlines, // critical for datalist
      title: 'Share Your Pet Travel Story | PetVoyage Blog',
      metaDescription:
        'Post your own pet flight story with photos and tips to help other pet parents plan their trips.',
      ogUrl: absoluteUrl(req, '/blog/new'),
    });
  } catch (e) {
    console.error('[GET /blog/new] failed to load airlines:', e);
    res.render('regulations/blog_new', {
      user: req.user,
      story: {},
      airlines: [], // safe fallback
      title: 'Share Your Pet Travel Story | PetVoyage Blog',
      metaDescription:
        'Post your own pet flight story with photos and tips to help other pet parents plan their trips.',
      ogUrl: absoluteUrl(req, '/blog/new'),
    });
  }
});

/* =========================
   SHOW: full story (slug or id)
   ========================= */
router.get('/:slugOrId', async (req, res) => {
  try {
    const key = req.params.slugOrId;
    const query = isObjectId(key) ? { _id: key } : { slug: key };

    const story = await Story.findOne(query)
      .populate('author', 'displayName email')
      .lean();

    if (!story) return res.status(404).send('Story not found');

    // Resolve airline for linking
    let airlineDoc = null;
    try {
      if (story.airlineSlug) {
        airlineDoc = await Airline.findOne({ slug: story.airlineSlug }, 'name slug').lean();
      }
      if (!airlineDoc && story.airline) {
        // exact case-insensitive name match
        const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        airlineDoc = await Airline.findOne(
          { name: new RegExp(`^${esc(story.airline)}$`, 'i') },
          'name slug'
        ).lean();
      }
      if (airlineDoc) console.log('[blog show] resolved airline:', airlineDoc);
    } catch (e) {
      console.warn('[blog show] airline lookup failed:', e.message);
    }

    const slug = story.slug || story._id;
    const canonical = absoluteUrl(req, `/blog/${slug}`);
    const leadImage =
      (story.photos && story.photos[0] && absoluteUrl(req, story.photos[0].url))
      || absoluteUrl(req, '/images/blog-banner.jpg');

    const metaDesc =
      (story.summary && story.summary.trim())
      || stripHtml(story.body || '').slice(0, 160);

    res.render('regulations/blog_show', {
      story,
      airlineDoc,          // <-- used by EJS to link to /airlines/:slug
      user: req.user || null,
      title: `${story.title} | Pet Travel Story | PetVoyage`,
      metaDescription: metaDesc,
      ogTitle: story.title,
      ogDescription: metaDesc,
      ogImage: leadImage,
      ogUrl: canonical,
      twitterTitle: story.title,
      twitterDescription: metaDesc,
      twitterImage: leadImage
    });
  } catch (e) {
    console.error('[GET /blog/:slugOrId] err', e);
    res.status(500).send('Server error');
  }
});

/* =========================
   CREATE STORY
   ========================= */
router.post(
  '/new',
  ensureAuth,
  upload.array('photos', 6),
  async (req, res) => {
    try {
      const {
        title,
        body,                     // HTML from the editor
        airline = '',
        route = '',               // single-field route (optional)
        routeFrom = '',           // split fields (optional)
        routeTo = '',
        country = '',
        summary = '',
        petType = '',
        petTypes = ''             // comma-separated tags
      } = req.body;

      if (!title || !body) {
        return res.status(400).send('Title and body are required.');
      }

      const slug = await uniqueSlugFromTitle(title);

      // Build "SFO → CDMX" if split fields used
      const normalizedRoute = (routeFrom || routeTo)
        ? `${routeFrom || ''}${routeFrom && routeTo ? ' → ' : ''}${routeTo || ''}`
        : route;

      const tags = (petTypes || '')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

      // Images
      const photos = [];
      const files = Array.isArray(req.files) ? req.files.slice(0, 6) : [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file || !file.buffer) continue;

        const stamp = Date.now();
        const safeBase = (file.originalname || 'photo')
          .toLowerCase()
          .replace(/\.[^.]+$/, '')
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9\-_]/g, '');
        const baseNameNoExt = `${stamp}-${i}-${safeBase}`;

        const out = await processImageBuffer(file.buffer, baseNameNoExt);
        photos.push({
          url: out.url,
          thumbUrl: out.thumbUrl,
          alt: title || 'Pet travel photo'
        });
      }

      await Story.create({
        title,
        slug,
        body, // (consider sanitization if needed)
        airline,
        route: normalizedRoute,
        country,
        summary,
        petType,
        petTypes: tags,
        photos,
        author: req.user._id
      });

      return res.redirect(`/blog/${slug}`);
    } catch (e) {
      console.error('[POST /blog/new] err', e);
      return res.status(400).send('Could not create story');
    }
  }
);

/* =========================
   EDIT STORY (form)
   ========================= */
router.get(
  '/:id/edit',
  ensureAuth,
  ensureOwner(findStoryByParam),
  async (req, res, next) => {
    try {
      const story = req.storyDoc.toObject();

      // minimal airline fields for datalist
      let airlines = [];
      try {
        airlines = await Airline.find({}, 'name slug').sort({ name: 1 }).lean();
      } catch (e) {
        console.warn('[blog edit] airlines fetch failed:', e.message);
      }

      res.render('regulations/blog_edit', {
        user: req.user,
        story,
        airlines, // datalist
        title: `Edit: ${story.title} | PetVoyage`,
        metaDescription: 'Edit your pet travel story.',
        ogUrl: absoluteUrl(req, `/blog/${story.slug || story._id}/edit`)
      });
    } catch (err) {
      next(err);
    }
  }
);

/* =========================
   UPDATE STORY
   ========================= */
router.post(
  '/:id',
  ensureAuth,
  ensureOwner(findStoryByParam),
  upload.array('photos', 6),
  async (req, res) => {
    try {
      const {
        title,
        body,
        airline = '',
        route = '',
        routeFrom = '',
        routeTo = '',
        country = '',
        summary = '',
        petType = '',
        petTypes = ''
      } = req.body;

      const story = req.storyDoc;

      // Keep slug stable by default (better for SEO). If missing, generate one.
      if (!story.slug || story.slug.trim() === '') {
        story.slug = await uniqueSlugFromTitle(title || story.title || 'story');
      }

      // Update fields
      story.title   = title || story.title;
      story.body    = body   || story.body;
      story.airline = airline;
      story.country = country;
      story.summary = summary;
      story.petType = petType;

      // Prefer split route fields if present
      const normalizedRoute = (routeFrom || routeTo)
        ? `${routeFrom || ''}${routeFrom && routeTo ? ' → ' : ''}${routeTo || ''}`
        : route;
      story.route = normalizedRoute;

      story.petTypes = (petTypes || '')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

      // Append any new photos
      const files = Array.isArray(req.files) ? req.files : [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const stamp = Date.now();
        const safeBase = (file.originalname || 'photo')
          .toLowerCase()
          .replace(/\.[^.]+$/, '')
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9\-_]/g, '');
        const baseNameNoExt = `${stamp}-${i}-${safeBase}`;
        const out = await processImageBuffer(file.buffer, baseNameNoExt);
        story.photos.push({
          url: out.url,
          thumbUrl: out.thumbUrl,
          alt: story.title || 'Pet travel photo'
        });
      }

      await story.save();
      res.redirect(`/blog/${story.slug || story._id}`);
    } catch (e) {
      console.error('[POST /blog/:id] err', e);
      res.status(400).send('Could not update story');
    }
  }
);

/* =========================
   DELETE STORY
   ========================= */
router.post(
  '/:id/delete',
  ensureAuth,
  ensureOwner(findStoryByParam),
  async (req, res) => {
    try {
      await req.storyDoc.deleteOne();
      res.redirect('/blog');
    } catch (e) {
      console.error('[DELETE story] err', e);
      res.status(400).send('Could not delete story');
    }
  }
);

/* =========================
   SITEMAP (blog only)
   ========================= */
router.get('/sitemap.xml', async (req, res) => {
  const origin = absoluteUrl(req, '/').replace(/\/$/, '');
  const stories = await Story.find({}, 'slug updatedAt createdAt').sort({ updatedAt: -1 }).lean();

  res.type('application/xml');
  const urls = stories.map(s => {
    const loc = s.slug ? `${origin}/blog/${s.slug}` : `${origin}/blog/${s._id}`;
    const lm  = new Date(s.updatedAt || s.createdAt || Date.now()).toISOString();
    return `
    <url>
      <loc>${loc}</loc>
      <lastmod>${lm}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.8</priority>
    </url>`;
  }).join('');

  res.send(`<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>${origin}/blog</loc><changefreq>daily</changefreq><priority>0.6</priority></url>
    ${urls}
  </urlset>`);
});

module.exports = router;
