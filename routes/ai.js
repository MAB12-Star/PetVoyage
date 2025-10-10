// routes/ai.js
const express = require('express');
const router = express.Router();

const OpenAI = require('openai'); // used for /ask-question and the per-box summaries
const CountryPetRegulation = require('../models/countryPetRegulationList');
const Airline = require('../models/airline');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.openaiKey,
});

/* ─────────────────────────── Ping & simple Q&A ─────────────────────────── */
router.get('/ask-ping', (req, res) => res.json({ ok: true }));

router.post('/ask-question', async (req, res) => {
  try {
    const user_question = (req.body?.user_question || '').trim();
    if (!user_question) return res.status(400).json({ error: "Missing 'user_question' in request body." });

    if (!client.apiKey) {
      return res.status(200).json({
        answer: "AI key not set. Add OPENAI_API_KEY (or openaiKey) on the server.",
        question: user_question
      });
    }

    const r = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are PetVoyage AI. Be concise and accurate.' },
        { role: 'user', content: user_question }
      ]
    });

    const answer = r.choices?.[0]?.message?.content?.trim()
      || "Sorry—I'm not sure about that yet.";

    return res.status(200).json({ answer, question: user_question });
  } catch (err) {
    console.error('[AI] Error:', err?.response?.data || err);
    return res.status(200).json({
      answer: "I couldn't reach the AI service just now. Please try again.",
      question: req.body?.user_question || ''
    });
  }
});

/* ─────────────────────────────── OPTIONS ─────────────────────────────── */
router.get('/pet-check/options', async (req, res) => {
  try {
    const airlines = await Airline.find({}, 'name airlineCode slug').sort({ name: 1 }).lean();
    const countriesDocs = await CountryPetRegulation.find({}, 'destinationCountry').sort({ destinationCountry: 1 }).lean();

    const countries = Array.from(new Set((countriesDocs || [])
      .map(d => d.destinationCountry)
      .filter(Boolean)));

    res.json({
      airlines: airlines.map(a => ({
        _id: a._id,
        name: a.name,
        airlineCode: a.airlineCode || '',
        slug: a.slug || ''
      })),
      countries
    });
  } catch (e) {
    console.error('[AI] options error:', e);
    res.json({ airlines: [], countries: [] });
  }
});

router.get('/pet-check/pet-types', async (req, res) => {
  try {
    const { country } = req.query;
    if (!country) return res.json({ petTypes: [] });

    const doc = await CountryPetRegulation.findOne({ destinationCountry: country }).lean();
    const map = doc?.regulationsByPetType || {};
    const petTypes = Object.keys(map);
    res.json({ petTypes });
  } catch (e) {
    console.error('[AI] pet-types error:', e);
    res.json({ petTypes: [] });
  }
});

/* ──────────────────────── PET-CHECK (Two-box layout, concise AI summaries) ──────────────────────── */
router.post('/pet-check', async (req, res) => {
  try {
    const { airlineId, airlineCode, country, petType } = req.body || {};
    if (!country || !petType || (!airlineId && !airlineCode)) {
      return res.status(400).json({ error: 'country, petType, and airlineId OR airlineCode are required.' });
    }

    // 1) Load Airline (structured fields kept for better AI summary)
    const airlineQuery = airlineId
      ? { _id: airlineId }
      : { airlineCode: String(airlineCode).toUpperCase() };

    const airline = await Airline.findOne(airlineQuery)
      .select([
        'name','airlineCode','slug','petPolicyURL',
        'PetPolicySummary','ImprovedPetPolicySummary',
        'microchip','healthCertificate',
        'inCompartment','inCompartmentAnimals','inCompartmentDetails','carrierCompartmentDetails',
        'inCargo','inCargoAnimals','inCargoDetails','carrierCargoDetails',
        'dangerousBreeds','dangerousBreedList',
        'brachycephalic','brachycephalicBreedList',
        'serviceAnimals','serviceAnimalDetails',
        'esAnimals','esaDetails',
        'petShipping',
        'healthVaccinations'
      ].join(' '))
      .lean();

    if (!airline) return res.status(404).json({ error: 'Airline not found.' });

    // 2) Load Country doc and extract the chosen petType node
    const countryDoc = await CountryPetRegulation.findOne({ destinationCountry: country }).lean();
    if (!countryDoc) return res.status(404).json({ error: 'Country regulations not found.' });

    const byType =
      countryDoc.regulationsByPetType instanceof Map
        ? countryDoc.regulationsByPetType.get(petType)
        : (countryDoc.regulationsByPetType || {})[petType];

    // Helpers
    const asEntries = (obj) => {
      if (!obj) return [];
      if (obj instanceof Map) return Array.from(obj.entries());
      if (typeof obj?.entries === 'function' && !Array.isArray(obj)) {
        try { return Array.from(obj.entries()); } catch {}
      }
      return Object.entries(obj || {});
    };

    const normalizeKV = (kv) =>
      asEntries(kv).map(([name, obj]) => ({
        name,
        description: obj?.description || '',
        requirements: Array.isArray(obj?.requirements) ? obj.requirements : []
      }));

    // Country regs (DB) — we only use these to feed the AI + build a tiny links footer
    const regs = byType
      ? {
          microchip: byType.microchip || '',
          moreInfo: byType.moreInfo || '',
          vaccinations: normalizeKV(byType.vaccinations),
          certifications: normalizeKV(byType.certifications),
          links: Array.isArray(byType.links) ? byType.links : []
        }
      : { microchip: '', moreInfo: '', vaccinations: [], certifications: [], links: [] };

    /* ───────────── AI summaries — Airline unchanged; Country updated to AI-only box ───────────── */
    let aiAirlineHtml = '';
    let aiCountryHtml = '';

    if (client.apiKey) {
      // AIRLINE — 3–6 quick bullets (unchanged)
      try {
        const airlineCtx = {
          name: airline.name || '',
          code: airline.airlineCode || '',
          summaryHtml: airline.ImprovedPetPolicySummary || airline.PetPolicySummary || '',

          microchip: airline.microchip || null,
          healthCertificate: airline.healthCertificate || null,

          inCabin: airline.inCompartment || null,
          inCabinAnimals: Array.isArray(airline.inCompartmentAnimals) ? airline.inCompartmentAnimals : [],
          inCabinDetails: airline.inCompartmentDetails || airline.carrierCompartmentDetails || '',

          inCargo: airline.inCargo || null,
          inCargoAnimals: Array.isArray(airline.inCargoAnimals) ? airline.inCargoAnimals : [],
          inCargoDetails: airline.inCargoDetails || airline.carrierCargoDetails || '',

          dangerousBreeds: airline.dangerousBreeds || null,
          dangerousBreedList: airline.dangerousBreedList || '',
          brachycephalic: airline.brachycephalic || null,
          brachycephalicBreedList: airline.brachycephalicBreedList || '',

          serviceAnimals: airline.serviceAnimals || null,
          serviceAnimalDetails: airline.serviceAnimalDetails || '',
          esAnimals: airline.esAnimals || null,
          esaDetails: airline.esaDetails || '',
          petShipping: airline.petShipping || null,

          healthVaccinations: Array.isArray(airline.healthVaccinations) ? airline.healthVaccinations : []
        };

        const airlinePrompt = [
          'Summarize ONLY the AIRLINE pet policy context below.',
          'Write a compact HTML fragment (no markdown) with:',
          '- a short <h4>heading</h4>',
          '- 3–6 <li> sentenced bullets.',
          'Focus on vacinations, in-cabin vs cargo allowed, eligible animals, airline-required microchip/health certificate, breed restrictions, service/ESA.',
          'Do NOT mention countries, immigration, customs, permits, quarantine.',
          'If unknown, omit rather than guess.',
          'Allowed tags: <div><h4><ul><li><small>',
          'Return JSON ONLY: {"html":"..."}',
          'Context JSON:',
          JSON.stringify(airlineCtx)
        ].join('\n');

        const ar = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Return only the JSON object required. Keep airline-only. Be brief.' },
            { role: 'user', content: airlinePrompt }
          ],
          temperature: 0.2
        });

        const parsed = JSON.parse(ar.choices?.[0]?.message?.content?.trim() || '{}');
        aiAirlineHtml = sanitizeMinimal(parsed.html || '');
      } catch (e) {
        console.warn('[AI] airline summary generation failed:', e?.message || e);
      }

      // COUNTRY — UPDATED: show only a concise AI bullet summary (+ tiny links footer)
      try {
        const countryCtx = {
          destinationCountry: country,
          petType,
          microchip: regs.microchip || '',
          vaccinations: regs.vaccinations,
          certifications: regs.certifications,
          moreInfo: regs.moreInfo || '',
          links: regs.links || []
        };

        const countryPrompt = [
          'Summarize ONLY the COUNTRY (immigration) pet requirements for the given pet type.',
          'Write a compact HTML fragment (no markdown) with:',
          '- a short <h4>heading</h4>',
          '- 4–8 <li> bullets covering microchip, vaccinations, certificates/permits, inspection/quarantine, and one timing tip if applicable.',
          'Do NOT mention airline rules, crate sizes, bookings, or fees.',
          'If some items are missing/unclear, add a final bullet with <small class="text-muted">Unverified – AI completion. Confirm with official sources.</small>.',
          'Keep bullets punchy—no paragraphs.',
          'Allowed tags: <div><h4><ul><li><small><a>',
          'Return JSON ONLY: {"html":"..."}',
          'Context JSON:',
          JSON.stringify(countryCtx)
        ].join('\n');

        const cr = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Return only the JSON object required. Keep country-only. Be brief.' },
            { role: 'user', content: countryPrompt }
          ],
          temperature: 0.25
        });

        const parsed2 = JSON.parse(cr.choices?.[0]?.message?.content?.trim() || '{}');
        aiCountryHtml = sanitizeMinimal(parsed2.html || '');
      } catch (e) {
        console.warn('[AI] country summary generation failed:', e?.message || e);
      }
    }

    /* ───────────── Build the two compact boxes ───────────── */
    const links = (regs.links || [])
      .slice(0, 5)
      .map(l => `<li><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.name)}</a></li>`)
      .join('');

    const html = `
      <style>
        .pv-box{border:3px solid #0f2b37;border-radius:6px;min-height:160px;padding:24px;margin:22px 0}
        .pv-box h2{font-weight:600;text-align:center;margin-bottom:16px}
        .pv-ai-chip{display:inline-block;font-size:.8rem;padding:.15rem .5rem;border:1px solid #ced4da;border-radius:50rem;color:#6c757d}
        .pv-minor{color:#6c757d;font-size:.9rem}
      </style>

      <div class="pv-itinerary">

        <!-- Airline (top) -->
        <div class="pv-box">
          <h2>Airline Regulations — ${escapeHtml(airline.name)}${airline.airlineCode ? ` (${escapeHtml(airline.airlineCode)})` : ''}</h2>

          ${aiAirlineHtml ? `<div class="mb-2"><span class="pv-ai-chip">AI summary</span></div><div>${aiAirlineHtml}</div>` : `
            <div class="pv-minor text-center">No airline summary available.</div>`}

          ${airline.slug
            ? `<div class="mt-3 text-center"><a class="badge rounded-pill text-bg-light border" href="/airlines/${escapeHtml(airline.slug)}" target="_blank" rel="noopener">Full airline policy ↗</a></div>`
            : '' }
        </div>

        <!-- Country (bottom) — AI summary ONLY + tiny links footer -->
        <div class="pv-box">
          <h2>Country Regulations — ${escapeHtml(country)} (${escapeHtml(petType)})</h2>

          ${aiCountryHtml ? `<div class="mb-2"><span class="pv-ai-chip">AI summary</span></div><div>${aiCountryHtml}</div>`
            : `<div class="pv-minor text-center">No country summary available.</div>`}

          ${links ? `<div class="mt-3"><h4 class="h6">Helpful links</h4><ul class="mb-0">${links}</ul></div>` : '' }
        </div>

      </div>
    `;

    // 5) Respond
    return res.json({
      html,
      airline: {
        name: airline.name,
        airlineCode: airline.airlineCode || '',
        slug: airline.slug || '',
        petPolicyURL: airline.slug ? `/airlines/${airline.slug}` : ''
      },
      country,
      petType
    });
  } catch (err) {
    console.error('[AI] /pet-check error:', err);
    return res.status(500).json({ error: 'Lookup failed.' });
  }
});

/* ───────────────────────────── Helpers ───────────────────────────── */
function stripHtml(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function sanitizeMinimal(html) {
  let s = String(html || '');
  s = s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/\s+on\w+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/<a\b([^>]*)>/gi, (m, attrs) => {
    let a = attrs || '';
    if (!/target\s*=/i.test(a)) a += ' target="_blank"';
    if (!/rel\s*=/i.test(a)) a += ' rel="noopener"';
    return `<a${a}>`;
  });
  return s.trim();
}

module.exports = router;
