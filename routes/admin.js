// routes/admin.js
const express = require('express');
const router = express.Router();

const Airline = require('../models/airline');
const User = require('../models/User');
const CountryPetRegulation = require('../models/countryPetRegulationList');
const Ad = require('../models/ad');  // <-- 🔹 REQUIRED IMPORT

const { ensureAuth } = require('../middleware');

const PAGE_SIZE = 12;
const rxEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ───────────────────────── Admin-only gate ───────────────────────── */
router.use(ensureAuth);
router.use((req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();

  return res.status(403).render('regulations/admin', {
    user: req.user || null,
    tab: 'airlines',
    airlines: [], airlineChoices: [], q: '', page: 1, pages: 1, total: 0,
    users: [], uq: '', upage: 1, upages: 1, utotal: 0,
    countries: [], cq: '', cpage: 1, cpages: 1, ctotal: 0,
    ads: [], aq: '', apage: 1, apages: 1, atotal: 0,
    error: 'Admins only.',
    success: ''
  });
});

/* =========================
 *  GET /admin (tabs handler)
 * ========================= */
router.get('/', async (req, res, next) => {
  try {
    const tab = req.query.tab || 'airlines';

    /* ===== USERS TAB ===== */
    if (tab === 'users') {
      const uq = (req.query.uq || '').trim();
      const upage = Math.max(parseInt(req.query.upage || '1', 10), 1);
      const limit = 20;
      
      const ufilter = uq
        ? { $or: [{ displayName: new RegExp(uq, 'i') }, { email: new RegExp(uq, 'i') }] }
        : {};

      const utotal = await User.countDocuments(ufilter);
      const upages = Math.ceil(utotal / limit);
      const users = await User.find(ufilter)
        .sort({ createdAt: -1 })
        .skip((upage - 1) * limit)
        .limit(limit)
        .lean();

      return res.render('regulations/admin', {
        user: req.user,
        tab,
        users, uq, upage, upages, utotal,
        airlines: [], airlineChoices: [], q: '', page: 1, pages: 1, total: 0,
        countries: [], cq: '', cpage: 1, cpages: 1, ctotal: 0,
        ads: [], aq: '', apage: 1, apages: 1, atotal: 0,
        error: '', success: ''
      });
    }

    /* ===== COUNTRIES TAB ===== */
    if (tab === 'countries') {
      const cq = (req.query.cq || '').trim();
      const cpage = Math.max(parseInt(req.query.cpage || '1', 10), 1);
      const limit = 25;

      const cfilter = cq ? { destinationCountry: new RegExp(cq, 'i') } : {};

      const ctotal = await CountryPetRegulation.countDocuments(cfilter);
      const cpages = Math.ceil(ctotal / limit);
      const countries = await CountryPetRegulation.find(cfilter)
        .sort({ destinationCountry: 1 })
        .skip((cpage - 1) * limit)
        .limit(limit)
        .lean();

      return res.render('regulations/admin', {
        user: req.user,
        tab,
        countries, cq, cpage, cpages, ctotal,
        airlines: [], airlineChoices: [], q: '', page: 1, pages: 1, total: 0,
        users: [], uq: '', upage: 1, upages: 1, utotal: 0,
        ads: [], aq: '', apage: 1, apages: 1, atotal: 0,
        error: '', success: ''
      });
    }

    /* ===== ADS TAB ===== */
    if (tab === 'ads') {
      const aq = (req.query.aq || '').trim();
      const apage = Math.max(parseInt(req.query.apage || '1', 10), 1);
      const limit = 25;

      const afilter = aq ? { title: new RegExp(aq, 'i') } : {};

      const atotal = await Ad.countDocuments(afilter);
      const apages = Math.ceil(atotal / limit);
      const ads = await Ad.find(afilter)
        .sort({ updatedAt: -1 })
        .skip((apage - 1) * limit)
        .limit(limit)
        .lean();

      return res.render('regulations/admin', {
  user: req.user,
  tab,
  ads, aq, apage, apages, atotal,
  
  // ADD THESE 👇 to prevent "q is not defined"
  q: '', page: 1, pages: 1, total: 0,
  airlineChoices: [], airlines: [],

  // users fallback
  users: [], uq: '', upage: 1, upages: 1, utotal: 0,
  
  // countries fallback
  countries: [], cq: '', cpage: 1, cpages: 1, ctotal: 0,

  error: '', success: ''
});

    }

    /* ===== AIRLINES TAB (default) ===== */
    const q = (req.query.q || '').trim();
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = 25;

    const airlineChoices = await Airline.find({}, { name: 1, airlineCode: 1, slug: 1 })
      .sort({ name: 1 })
      .lean();

    const filter = q
      ? { $or: [{ name: new RegExp(q, 'i') }, { airlineCode: new RegExp(q, 'i') }, { slug: new RegExp(q, 'i') }] }
      : {};

    const total = await Airline.countDocuments(filter);
    const pages = Math.ceil(total / limit);
    const airlines = await Airline.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.render('regulations/admin', {
      user: req.user,
      tab, q, page, pages, total,
      airlines,
      airlineChoices,
      users: [], uq: '', upage: 1, upages: 1, utotal: 0,
      countries: [], cq: '', cpage: 1, cpages: 1, ctotal: 0,
      ads: [], aq: '', apage: 1, apages: 1, atotal: 0,
      error: '', success: ''
    });

  } catch (err) {
    next(err);
  }
});





/* =========================
 *  AIRLINES CRUD
 * ========================= */

// POST /admin/airlines – create
router.post('/airlines', async (req, res, next) => {
  try {
    const body = { ...req.body };

    ['microchip','healthCertificate','inCargo','inCompartment','dangerousBreeds','brachycephalic','serviceAnimals','esAnimals','petShipping']
      .forEach(f => { if (body[f] === undefined) body[f] = 'no'; });

    ['inCargoAnimals','inCompartmentAnimals','healthVaccinations'].forEach(f => {
      if (!body[f]) body[f] = [];
      if (!Array.isArray(body[f])) body[f] = [body[f]];
    });

    const airline = new Airline(body);
    await airline.save();
    req.flash('success', `Airline "${airline.name}" created.`);
    res.redirect('/admin?tab=airlines');
  } catch (err) {
    next(err);
  }
});

// GET /admin/airlines/:id – fetch one (AJAX for edit modal)
router.get('/airlines/:id', async (req, res, next) => {
  try {
    const airline = await Airline.findById(req.params.id).lean();
    if (!airline) return res.status(404).json({ error: 'Not found' });
    res.json(airline);
  } catch (err) {
    next(err);
  }
});

// PUT /admin/airlines/:id
router.put('/airlines/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const normalizeArray = (v) => {
      if (v === undefined) return undefined;
      if (Array.isArray(v)) return v;
      if (v === '' || v == null) return [];
      return [v];
    };

    const yesNo = (v) => {
      if (v === undefined) return undefined;
      if (v === true) return 'yes';
      if (v === false) return 'no';
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (['yes','y','true','1'].includes(s)) return 'yes';
        if (['no','n','false','0'].includes(s)) return 'no';
      }
      return v;
    };

    const body = req.body || {};

    const fields = [
      'name','airlineCode','slug','airlineURL','petPolicyURL','logo',
      'PetPolicySummary','ImprovedPetPolicySummary',
      'inCompartmentDetails','inCargoDetails',
      'dangerousBreedList','brachycephalicBreedList',
      'carrierCargoDetails','carrierCompartmentDetails',
      'esaDetails'
    ];

    const yesNoFields = [
      'microchip','healthCertificate','serviceAnimals','esAnimals',
      'inCompartment','inCargo','dangerousBreeds','brachycephalic'
    ];

    const arrayFields = [
      'inCompartmentAnimals','inCargoAnimals','healthVaccinations'
    ];

    const update = {};

    fields.forEach(f => {
      const v = body[f];
      if (v !== undefined && v !== '') update[f] = v;
    });

    yesNoFields.forEach(f => {
      const v = yesNo(body[f]);
      if (v !== undefined && v !== '') update[f] = v;
    });

    arrayFields.forEach(f => {
      const v = normalizeArray(body[f]);
      if (v !== undefined) update[f] = v; // allow empty array
    });

    await Airline.findByIdAndUpdate(id, { $set: update }, { runValidators: true });
    req.flash('success', 'Airline updated.');
    res.redirect('/admin?tab=airlines');
  } catch (err) {
    next(err);
  }
});

// DELETE /admin/airlines/:id
router.delete('/airlines/:id', async (req, res, next) => {
  try {
    const deleted = await Airline.findByIdAndDelete(req.params.id);
    if (!deleted) {
      req.flash('error', 'Airline not found.');
    } else {
      req.flash('success', `Airline "${deleted.name}" deleted.`);
    }
    res.redirect('/admin?tab=airlines');
  } catch (err) {
    next(err);
  }
});

/* =========================
 *  USERS – LIST + SEARCH
 * ========================= */
router.get('/users', async (req, res, next) => {
  try {
    const tab  = req.query.tab || 'airlines';

    if (tab === 'users') {
      const uq    = (req.query.uq || '').trim();
      const upage = Math.max(parseInt(req.query.upage || '1', 10), 1);
      const limit = 20;

      const ufilter = {};
      if (uq) {
        ufilter.$or = [
          { displayName: { $regex: uq, $options: 'i' } },
          { email:       { $regex: uq, $options: 'i' } }
        ];
      }

      const utotal = await User.countDocuments(ufilter);
      const upages = Math.max(Math.ceil(utotal / limit), 1);

      const users = await User.find(ufilter)
        .sort({ createdAt: -1 })
        .skip((upage - 1) * limit)
        .limit(limit)
        .lean();

      return res.render('regulations/admin', {
        user: req.user,
        tab,
        airlines: [], airlineChoices: [], q: '', page: 1, pages: 1, total: 0,
        users, uq, upage, upages, utotal,
        countries: [], cq: '', cpage: 1, cpages: 1, ctotal: 0,
        error: '', success: ''
      });
    }

    // fallback to airlines tab rendering if tab!=users
    const q     = (req.query.q || '').trim();
    const page  = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = 25;

    const airlineChoices = await Airline
      .find({}, { name: 1, airlineCode: 1, slug: 1 })
      .sort({ name: 1 })
      .lean();

    const filter = {};
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { airlineCode: rx }, { slug: rx }];
    }

    const total = await Airline.countDocuments(filter);
    const airlines = await Airline.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const pages = Math.max(Math.ceil(total / limit), 1);

    res.render('regulations/admin', {
      user: req.user,
      tab, q, page, pages, total,
      airlines,
      airlineChoices,
      users: [], uq: '', upage: 1, upages: 1, utotal: 0,
      countries: [], cq: '', cpage: 1, cpages: 1, ctotal: 0,
      error: '', success: ''
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/users/:id (JSON for edit modal)
router.get('/users/:id', async (req, res, next) => {
  try {
    const u = await User.findById(req.params.id).lean();
    if (!u) return res.status(404).json({ error: 'Not found' });
    res.json(u);
  } catch (err) {
    next(err);
  }
});

/* =========================
 *  USERS – UPDATE
 * ========================= */
router.put('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const body = req.body || {};
    const up = {};
    ['displayName', 'email'].forEach(f => {
      if (body[f] !== undefined && body[f] !== '') up[f] = body[f];
    });

    if (body.role && ['user', 'vendor', 'admin'].includes(body.role)) {
      up.role = body.role;
    }

    await User.findByIdAndUpdate(id, { $set: up }, { runValidators: true });
    req.flash('success', 'User updated.');
    res.redirect('/admin?tab=users');
  } catch (err) {
    next(err);
  }
});

/* =========================
 *  COUNTRIES CRUD
 * ========================= */

function safeParse(json, fallback) {
  if (!json || typeof json !== 'string') return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}

// GET /admin/countries/:id → JSON for modal
router.get('/countries/:id', async (req, res, next) => {
  try {
    const doc = await CountryPetRegulation.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (e) {
    next(e);
  }
});

// POST /admin/countries → create
router.post('/countries', async (req, res, next) => {
  try {
    const {
      destinationCountry,
      regulationsJson,
      originReqsJson,
      officialLinksJson,

      // ✅ NEW
      sourceLastModified,
      sourceLastModifiedNote
    } = req.body;

    if (!destinationCountry || !destinationCountry.trim()) {
      req.flash('error', 'Destination Country is required.');
      return res.redirect('/admin?tab=countries');
    }

    const doc = new CountryPetRegulation({
      destinationCountry: destinationCountry.trim(),
      regulationsByPetType: safeParse(regulationsJson, {}),
      originRequirements: safeParse(originReqsJson, {}),
      officialLinks: safeParse(officialLinksJson, []),

      // ✅ NEW
      sourceLastModified: sourceLastModified ? new Date(sourceLastModified) : null,
      sourceLastModifiedNote: (sourceLastModifiedNote || '').trim()
    });

    await doc.save();
    req.flash('success', `Country "${doc.destinationCountry}" created.`);
    res.redirect('/admin?tab=countries');
  } catch (e) {
    next(e);
  }
});


router.put('/countries/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const up = {};

    if (req.body.destinationCountry && req.body.destinationCountry.trim()) {
      up.destinationCountry = req.body.destinationCountry.trim();
    }
    if ('regulationsJson' in req.body) {
      up.regulationsByPetType = safeParse(req.body.regulationsJson, {});
    }
    if ('originReqsJson' in req.body) {
      up.originRequirements = safeParse(req.body.originReqsJson, {});
    }
    if ('officialLinksJson' in req.body) {
      up.officialLinks = safeParse(req.body.officialLinksJson, []);
    }

    // ✅ NEW
    if ('sourceLastModified' in req.body) {
      up.sourceLastModified = req.body.sourceLastModified
        ? new Date(req.body.sourceLastModified)
        : null;
    }
    if ('sourceLastModifiedNote' in req.body) {
      up.sourceLastModifiedNote = (req.body.sourceLastModifiedNote || '').trim();
    }

    await CountryPetRegulation.findByIdAndUpdate(id, { $set: up }, { runValidators: true });
    req.flash('success', 'Country regulations updated.');
    res.redirect('/admin?tab=countries');
  } catch (e) {
    next(e);
  }
});


// DELETE /admin/countries/:id
router.delete('/countries/:id', async (req, res, next) => {
  try {
    const deleted = await CountryPetRegulation.findByIdAndDelete(req.params.id);
    if (!deleted) {
      req.flash('error', 'Country not found.');
    } else {
      req.flash('success', `Country "${deleted.destinationCountry}" deleted.`);
    }
    res.redirect('/admin?tab=countries');
  } catch (e) {
    next(e);
  }
});

// ===== ADS TAB =====

// CREATE Ad
router.post('/ads', async (req, res, next) => {
  try {
    const {
      title,
      adType,
      placements, // now array from checkboxes
      imageUrl,
      linkUrl,
      content,  // html or product embed
      pages,
      active
    } = req.body;

    const ad = new Ad({
      title,
      adType,
      placements: Array.isArray(placements) ? placements : [placements],
      imageUrl: adType === 'image' ? imageUrl : undefined,
      linkUrl: linkUrl || '',
      content: adType !== 'image' ? content : undefined,
      pages: pages
        ? pages.split(',').map(p => p.trim()).filter(Boolean)
        : ['*'],
      active: active === 'on' || active === 'true'
    });

    await ad.save();
    req.flash('success', `Ad "${ad.title}" created successfully.`);
    res.redirect('/admin?tab=ads');
  } catch (err) {
    console.error('Error creating ad:', err);
    next(err);
  }
});


// FETCH single ad for edit modal (AJAX)
router.get('/ads/:id', async (req, res, next) => {
  try {
    const ad = await Ad.findById(req.params.id).lean();
    if (!ad) return res.status(404).json({ error: 'Ad not found' });
    res.json(ad);
  } catch (err) {
    console.error('Error loading ad:', err);
    next(err);
  }
});


// UPDATE Ad
router.put('/ads/:id', async (req, res, next) => {
  try {
    const {
      title,
      adType,
      placements,
      imageUrl,
      linkUrl,
      content,
      pages,
      active
    } = req.body;

    const updatedData = {
      title,
      adType,
      placements: Array.isArray(placements) ? placements : [placements],
      imageUrl: adType === 'image' ? imageUrl : undefined,
      linkUrl: linkUrl || '',
      content: adType !== 'image' ? content : undefined,
      pages: pages
        ? pages.split(',').map(p => p.trim()).filter(Boolean)
        : ['*'],
      active: active === 'on' || active === 'true'
    };

    await Ad.findByIdAndUpdate(req.params.id, updatedData, { runValidators: true });
    req.flash('success', `Ad "${title}" updated.`);
    res.redirect('/admin?tab=ads');
  } catch (err) {
    console.error('Error updating ad:', err);
    next(err);
  }
});


// DELETE Ad
router.delete('/ads/:id', async (req, res, next) => {
  try {
    await Ad.findByIdAndDelete(req.params.id);
    req.flash('success', 'Ad deleted.');
    res.redirect('/admin?tab=ads');
  } catch (err) {
    console.error('Error deleting ad:', err);
    next(err);
  }
});


module.exports = router;
