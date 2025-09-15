// routes/admin.js
const express = require('express');
const router = express.Router();
const Airline = require('../models/Airline');
const User = require('../models/User'); 
const CountryPetRegulation = require('../models/countryPetRegulationList');

const PAGE_SIZE = 12;
const rxEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');



// GET /admin  (router mounted at /admin)
router.get('/', async (req, res, next) => {
    try {
      const tab = req.query.tab || 'airlines';
  
      // ===== USERS TAB (unchanged) =====
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
          tab,
          // airlines fallbacks
          airlines: [], airlineChoices: [], q: '', page: 1, pages: 1, total: 0,
          // users
          users, uq, upage, upages, utotal,
          // countries fallbacks
          countries: [], cq: '', cpage: 1, cpages: 1, ctotal: 0,
        });
      }
  
      // ===== COUNTRIES TAB (NEW) =====
      if (tab === 'countries') {
        const cq    = (req.query.cq || '').trim();
        const cpage = Math.max(parseInt(req.query.cpage || '1', 10), 1);
        const limit = 25;
  
        const cfilter = {};
        if (cq) cfilter.destinationCountry = { $regex: rxEscape(cq), $options: 'i' };
  
        const ctotal   = await CountryPetRegulation.countDocuments(cfilter);
        const cpages   = Math.max(Math.ceil(ctotal / limit), 1);
        const countries = await CountryPetRegulation.find(cfilter)
          .sort({ destinationCountry: 1 })
          .skip((cpage - 1) * limit)
          .limit(limit)
          .lean();
  
        return res.render('regulations/admin', {
          tab,
          // airlines fallbacks
          airlines: [], airlineChoices: [], q: '', page: 1, pages: 1, total: 0,
          // users fallbacks
          users: [], uq: '', upage: 1, upages: 1, utotal: 0,
          // countries
          countries, cq, cpage, cpages, ctotal,
        });
      }
  
      // ===== AIRLINES TAB (existing) =====
      const q     = (req.query.q || '').trim();
      const page  = Math.max(parseInt(req.query.page || '1', 10), 1);
      const limit = 25;
  
      const airlineChoices = await Airline
        .find({}, { name: 1, airlineCode: 1, slug: 1 })
        .sort({ name: 1 })
        .lean();
  
      const filter = {};
      if (q) {
        const rx = new RegExp(rxEscape(q), 'i');
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
        tab, q, page, pages, total,
        airlines,
        airlineChoices,
        // users defaults
        users: [], uq: '', upage: 1, upages: 1, utotal: 0,
        // countries defaults
        countries: [], cq: '', cpage: 1, cpages: 1, ctotal: 0,
      });
    } catch (err) {
      next(err);
    }
  });
  
  

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
  
      // Ensure multi-selects are arrays if present
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
        return v; // leave as-is if unknown
      };
  
      const body = req.body || {};
  
      // Build update doc ONLY with provided, non-empty values
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
  

// DELETE /admin/airlines/:id – delete
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
// GET /admin  (because it's mounted at /admin)
// GET /admin  (router mounted at /admin)
router.get('/users', async (req, res, next) => {
    try {
        console.log('[ADMIN] tab param =', req.query.tab);  // <— add this
        const tab  = req.query.tab || 'airlines';
  
      if (tab === 'users') {
        // --- USERS TAB ---
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
  
        /** ===== DEBUG (keeps only while diagnosing) ===== */
        const mongoose = require('mongoose');
        const conn = mongoose.connection;
        console.log('[ADMIN/users] host:', conn.host);
        console.log('[ADMIN/users] db name:', conn.name);
        console.log('[ADMIN/users] readyState:', conn.readyState); // 1 = connected
        console.log('[ADMIN/users] estimatedDocumentCount:', await User.estimatedDocumentCount());
        console.log('[ADMIN/users] count(filter):', utotal, 'uq =', JSON.stringify(uq));
        const sample = await User.findOne({}, { displayName: 1, email: 1 }).lean();
        console.log('[ADMIN/users] sample doc:', sample);
        /** ============================================== */
  
        return res.render('regulations/admin', {
          tab,
          // airlines fallbacks so the view doesn't break
          airlines: [],
          airlineChoices: [],
          q: '',
          page: 1,
          pages: 1,
          total: 0,
          // users vars
          users,
          uq,
          upage,
          upages,
          utotal
        });
      }
  
      // --- AIRLINES TAB ---
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
        tab, q, page, pages, total,
        airlines,
        airlineChoices,
        // users defaults so the view is happy if someone navigates tabs client-side
        users: [],
        uq: '',
        upage: 1,
        upages: 1,
        utotal: 0
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
  
      // Only update fields that are present and non-empty
      const body = req.body || {};
      const up = {};
      ['displayName', 'email'].forEach(f => {
        if (body[f] !== undefined && body[f] !== '') up[f] = body[f];
      });
  
      // role: user/vendor/admin
      if (body.role && ['user', 'vendor', 'admin'].includes(body.role)) {
        up.role = body.role;
      }
  
      // Optionally allow light editing of toDoList keys (safe version: only if provided as JSON)
      // if (body.toDoListJson) {
      //   try {
      //     const parsed = JSON.parse(body.toDoListJson);
      //     if (parsed && typeof parsed === 'object') up.toDoList = parsed;
      //   } catch (e) { /* ignore parse errors */ }
      // }
  
      await User.findByIdAndUpdate(id, { $set: up }, { runValidators: true });
      req.flash('success', 'User updated.');
      res.redirect('/admin?tab=users');
    } catch (err) {
      next(err);
    }
  });
  
// Helpers to parse JSON textareas safely
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
      } = req.body;
  
      if (!destinationCountry || !destinationCountry.trim()) {
        req.flash('error', 'Destination Country is required.');
        return res.redirect('/admin?tab=countries');
      }
  
      const doc = new CountryPetRegulation({
        destinationCountry: destinationCountry.trim(),
        regulationsByPetType: safeParse(regulationsJson, {}), // Mongoose casts to Map
        originRequirements:   safeParse(originReqsJson, {}),   // Map
        officialLinks:        safeParse(officialLinksJson, []),// Array
      });
  
      await doc.save();
      req.flash('success', `Country "${doc.destinationCountry}" created.`);
      res.redirect('/admin?tab=countries');
    } catch (e) {
      next(e);
    }
  });
  
  // PUT /admin/countries/:id → update (partial)
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
  

module.exports = router;
