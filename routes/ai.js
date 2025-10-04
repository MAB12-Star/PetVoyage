// routes/ai.js
const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const CountryPetRegulation = require('../models/countryPetRegulationList'); // adjust path if different
const Airline = require('../models/airline');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.openaiKey,
});

router.get('/ask-ping', (req, res) => res.json({ ok: true }));

router.post('/ask-question', async (req, res) => {
  try {
    const user_question = (req.body?.user_question || '').trim();
    console.log('[AI] POST /ask-question:', user_question);

    if (!user_question) {
      return res.status(400).json({ error: "Missing 'user_question' in request body." });
    }
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

/* =========================================================
   OPTIONS
   =======================================================*/

// Return airlines (+slug) and countries (distinct list)
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

// Return the pet types for a given country (keys in regulationsByPetType)
router.get('/pet-check/pet-types', async (req, res) => {
  try {
    const { country } = req.query;
    if (!country) return res.json({ petTypes: [] });

    const doc = await CountryPetRegulation.findOne({ destinationCountry: country }).lean();
    const map = doc?.regulationsByPetType || {}; // lean() → plain object
    const petTypes = Object.keys(map);

    res.json({ petTypes });
  } catch (e) {
    console.error('[AI] pet-types error:', e);
    res.json({ petTypes: [] });
  }
});

/* =========================================================
   PET-CHECK (AIRLINE + COUNTRY → HTML ITINERARY)
   =======================================================*/

router.post('/pet-check', async (req, res) => {
  try {
    const { airlineId, airlineCode, country, petType } = req.body || {};

    if (!country || !petType || (!airlineId && !airlineCode)) {
      return res.status(400).json({ error: 'country, petType, and airlineId OR airlineCode are required.' });
    }

    // 1) Fetch airline + country docs
    const airlineQuery = airlineId ? { _id: airlineId } : { airlineCode: String(airlineCode).toUpperCase() };
    const airlineFields =
      'name airlineCode slug petPolicyURL ' +
      'microchip healthCertificate ' +
      'inCompartment inCompartmentAnimals carrierCompartmentDetails inCompartmentDetails ' +
      'inCargo inCargoAnimals carrierCargoDetails inCargoDetails ' +
      'dangerousBreeds dangerousBreedList brachycephalic brachycephalicBreedList ' +
      'serviceAnimals serviceAnimalDetails esAnimals esaDetails petShipping ' +
      'PetPolicySummary ImprovedPetPolicySummary healthVaccinations';
    const airline = await Airline.findOne(airlineQuery).select(airlineFields).lean();
    if (!airline) return res.status(404).json({ error: 'Airline not found.' });

    const countryDoc = await CountryPetRegulation.findOne({ destinationCountry: country }).lean();
    if (!countryDoc) return res.status(404).json({ error: 'Country regulations not found.' });

    // 2) Normalize regs for the pet type (Map/Object safe)
    const asEntries = (maybeMapOrObj) => {
      if (!maybeMapOrObj) return [];
      if (maybeMapOrObj instanceof Map) return Array.from(maybeMapOrObj.entries());
      if (typeof maybeMapOrObj.entries === 'function' && !Array.isArray(maybeMapOrObj)) {
        try { return Array.from(maybeMapOrObj.entries()); } catch {}
      }
      return Object.entries(maybeMapOrObj);
    };

    const byTypeRaw = countryDoc.regulationsByPetType instanceof Map
      ? countryDoc.regulationsByPetType.get(petType)
      : (countryDoc.regulationsByPetType || {})[petType];

    const normalizeKV = (kv) => asEntries(kv).map(([name, obj]) => ({
      name,
      description: obj?.description || '',
      requirements: Array.isArray(obj?.requirements) ? obj.requirements : []
    }));

    const regs = byTypeRaw ? {
      microchip: byTypeRaw.microchip || '',
      moreInfo: byTypeRaw.moreInfo || '',
      vaccinations: normalizeKV(byTypeRaw.vaccinations),
      certifications: normalizeKV(byTypeRaw.certifications),
      links: Array.isArray(byTypeRaw.links) ? byTypeRaw.links : []
    } : { microchip:'', moreInfo:'', vaccinations:[], certifications:[], links:[] };

    // origin requirements
    const originRequirements = asEntries(countryDoc.originRequirements).map(([key, val]) => ({
      name: key,
      appliesTo: Array.isArray(val?.appliesTo) ? val.appliesTo : [],
      details: val?.details || ''
    }));

    // 3) Prepare AI (optional) to fill gaps & overview
    const gaps = {
      microchip: !stripHtml(regs.microchip),
      vaccinations: !(regs.vaccinations && regs.vaccinations.length),
      certifications: !(regs.certifications && regs.certifications.length),
      moreInfo: !stripHtml(regs.moreInfo),
      originRequirements: originRequirements.length === 0
    };

    let aiBlocks = { overview: '', microchip: '', vaccinations: '', certifications: '', origin: '', more: '' };

    if (client.apiKey) {
      try {
        const context = {
          airline: {
            name: airline.name || '',
            code: airline.airlineCode || '',
            slug: airline.slug || '',
            petPolicyURL: airline.petPolicyURL || '',
            microchip: airline.microchip || null,
            healthCertificate: airline.healthCertificate || null,
            inCompartment: airline.inCompartment || null,
            inCompartmentAnimals: airline.inCompartmentAnimals || [],
            inCompartmentDetails: airline.inCompartmentDetails || '',
            carrierCompartmentDetails: airline.carrierCompartmentDetails || '',
            inCargo: airline.inCargo || null,
            inCargoAnimals: airline.inCargoAnimals || [],
            inCargoDetails: airline.inCargoDetails || '',
            carrierCargoDetails: airline.carrierCargoDetails || '',
            dangerousBreeds: airline.dangerousBreeds || null,
            dangerousBreedList: airline.dangerousBreedList || '',
            brachycephalic: airline.brachycephalic || null,
            brachycephalicBreedList: airline.brachycephalicBreedList || '',
            serviceAnimals: airline.serviceAnimals || null,
            serviceAnimalDetails: airline.serviceAnimalDetails || '',
            esAnimals: airline.esAnimals || null,
            esaDetails: airline.esaDetails || '',
            petShipping: airline.petShipping || null,
            healthVaccinations: airline.healthVaccinations || [],
            summaries: {
              PetPolicySummary: airline.PetPolicySummary || '',
              ImprovedPetPolicySummary: airline.ImprovedPetPolicySummary || ''
            }
          },
          country,
          petType,
          regs,
          originRequirements
        };

        const prompt = [
          `You're PetVoyage AI. Create **concise, Bootstrap-friendly HTML fragments** only (no backticks, no markdown)`,
          `for an itinerary-style summary of pet travel requirements.`,
          `Show:`,
          `- An "Overview" (2–5 bullets)`,
          `- If any section is missing/empty, provide **general best-practice guidance** clearly labeled`,
          `  "Unverified – AI completion. Confirm with official sources."`,
          `- Keep to safe, generic, time-based steps (T-30d, T-10d, T-48h, Day of travel) when helpful.`,
          `- Use only these tags/classes: <div>, <p>, <ul>, <ol>, <li>, <h3>, <h4>, <small>, <a>,`,
          `  and Bootstrap table classes if you must (<table class="table table-sm table-striped">...).`,
          `- Do **not** invent country-specific legal requirements. When unsure, provide general guidance with the unverified label.`,
          ``,
          `Context (JSON):`,
          JSON.stringify(context),
          ``,
          `Return a single JSON object with keys:`,
          `{"overviewHtml": "...", "microchipHtml": "...", "vaccinationsHtml": "...", "certificationsHtml": "...", "originHtml": "...", "moreInfoHtml": "..."}`,
          `Each value must be raw HTML with no surrounding code fences.`
        ].join('\n');

        const r = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Return only the JSON object described. Keep outputs concise and helpful.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.4
        });

        const txt = r.choices?.[0]?.message?.content?.trim() || '{}';
        try {
          const parsed = JSON.parse(txt);
          aiBlocks = {
            overview: parsed.overviewHtml || '',
            microchip: parsed.microchipHtml || '',
            vaccinations: parsed.vaccinationsHtml || '',
            certifications: parsed.certificationsHtml || '',
            origin: parsed.originHtml || '',
            more: parsed.moreInfoHtml || ''
          };
        } catch (e) {
          console.warn('[AI] itinerary JSON parse failed; falling back to minimal summary.');
          aiBlocks.overview = `<ul class="mb-0"><li>Airline: ${escapeHtml(airline.name)}${airline.airlineCode ? ` (${escapeHtml(airline.airlineCode)})` : ''}</li><li>Destination: ${escapeHtml(country)}</li><li>Pet: ${escapeHtml(petType)}</li></ul>`;
        }
      } catch (e) {
        console.warn('[AI] itinerary generation skipped:', e.message);
      }
    }

    // 4) Build HTML
    const titleLine = `${petType} • ${airline.name}${airline.airlineCode ? ` (${airline.airlineCode})` : ''} → ${country}`;
    const airlineHtml = renderAirlinePolicyCard(airline);
    const countryHtml = renderCountryHtml({ country, petType, regs, originRequirements, titleLine, aiBlocks });

    const html = `
      <div class="pv-itinerary">
        ${airlineHtml}
        ${countryHtml}
      </div>
    `;

    // 5) Respond (policy URL points to YOUR site)
    return res.json({
      html,
      airline: {
        name: airline.name,
        airlineCode: airline.airlineCode || '',
        slug: airline.slug || '',
        petPolicyURL: airline.slug ? `https://www.petvoyage.ai/airlines/${airline.slug}` : ''
      },
      country,
      petType
    });
  } catch (err) {
    console.error('[AI] /pet-check error:', err);
    return res.status(500).json({ error: 'Lookup failed.' });
  }
});

/* =========================================================
   HELPERS
   =======================================================*/

function stripHtml(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Short, safe summary from HTML
function summarizeText(html, max = 220) {
  const text = stripHtml(html || '');
  return text.length > max ? text.slice(0, max).trim() + '…' : text;
}

// Minimal sanitizer for rich airline details
function sanitizeMinimal(html) {
  let s = String(html || '');
  // remove script/style blocks
  s = s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // remove HTML comments
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  // strip on*="..." attributes
  s = s.replace(/\s+on\w+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // ensure <a> tags open safely
  s = s.replace(/<a\b([^>]*)>/gi, (m, attrs) => {
    let a = attrs || '';
    if (!/target\s*=/i.test(a)) a += ' target="_blank"';
    if (!/rel\s*=/i.test(a)) a += ' rel="noopener"';
    return `<a${a}>`;
  });
  return s.trim();
}

function detailsBlock(id, shortText, fullHtml) {
  if (!shortText && !fullHtml) return '';
  const short = shortText
    ? `<div class="text-body-secondary small mt-1">${escapeHtml(shortText)}${fullHtml ? ` <a class="ms-1" data-bs-toggle="collapse" href="#${id}" role="button" aria-expanded="false" aria-controls="${id}">Show details</a>` : ''}</div>`
    : '';
  const rich = fullHtml
    ? `<div id="${id}" class="collapse mt-2">${sanitizeMinimal(fullHtml)}</div>`
    : '';
  return short + rich;
}

function bulletsFromKV(list, title) {
  if (!Array.isArray(list) || !list.length) return '';
  const items = list.map(v => {
    const reqs = Array.isArray(v.requirements) && v.requirements.length
      ? `<ul>${v.requirements.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : '';
    return `<li><strong>${escapeHtml(v.name)}:</strong> ${stripHtml(v.description)}${reqs}</li>`;
  }).join('');
  return `<h4 class="mt-3">${escapeHtml(title)}</h4><ul class="mb-0">${items}</ul>`;
}

function originList(originRequirements) {
  if (!Array.isArray(originRequirements) || !originRequirements.length) return '';
  const items = originRequirements.map(o => {
    const applies = o.appliesTo && o.appliesTo.length ? ` (applies to: ${o.appliesTo.map(escapeHtml).join(', ')})` : '';
    return `<li><strong>${escapeHtml(o.name)}</strong> — ${escapeHtml(o.details)}${applies}</li>`;
  }).join('');
  return `<ul class="mb-0">${items}</ul>`;
}

function renderCountryHtml({ country, petType, regs, originRequirements, titleLine, aiBlocks }) {
  const vList = (regs?.vaccinations || []).map(v => {
    const reqs = (v.requirements || []).map(r => `<div class="mt-1 ps-4 text-body-secondary">• ${escapeHtml(r)}</div>`).join('');
    return `
      <li class="mb-2">
        <strong>${escapeHtml(v.name)}:</strong> ${stripHtml(v.description)}
        ${reqs}
      </li>`;
  }).join('');

  const cList = (regs?.certifications || []).map(c => {
    const reqs = (c.requirements || []).map(r => `<div class="mt-1 ps-4 text-body-secondary">• ${escapeHtml(r)}</div>`).join('');
    return `
      <li class="mb-2">
        <strong>${escapeHtml(c.name)}:</strong> ${stripHtml(c.description)}
        ${reqs}
      </li>`;
  }).join('');

  const overviewHtml = aiBlocks?.overview || `
    <ul>
      ${stripHtml(regs?.microchip) ? `<li>${regs.microchip}</li>` : ''}
      ${stripHtml(regs?.moreInfo)  ? `<li>${regs.moreInfo}</li>` : ''}
      <li>Always verify details with official sources before travel.</li>
    </ul>
  `;

  const microchipHtml = stripHtml(regs?.microchip)
    ? regs.microchip
    : (aiBlocks?.microchip || '<p>Not specified.</p>');

  const vaccHtml = vList || (aiBlocks?.vaccinations || '<li>No vaccinations listed.</li>');
  const certHtml = cList || (aiBlocks?.certifications || '<li>No certifications listed.</li>');
  const originHtml = (originRequirements && originRequirements.length)
    ? originList(originRequirements)
    : (aiBlocks?.origin || '<p class="mb-0">No origin requirements listed.</p>');
  const moreHtml = stripHtml(regs?.moreInfo)
    ? regs.moreInfo
    : (aiBlocks?.more || '');

  const links = (regs?.links || []).map(l => `<li><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.name)}</a></li>`).join('');

  return `
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-body">
        <h1 class="h3 text-center mb-2">Itinerary &amp; Requirements</h1>
        <div class="text-center text-muted mb-3">${escapeHtml(titleLine)}</div>

        <h2 class="h4 mt-3">Overview</h2>
        ${overviewHtml}

        <h3 class="h5 mt-4">Suggested Timeline</h3>
        <ul>
          <li><strong>T-30 days:</strong> Check microchip + vaccinations; book vet visit; review airline and destination rules.</li>
          <li><strong>T-10 days:</strong> Confirm any certificates; verify crate dimensions + labels.</li>
          <li><strong>T-48 hours:</strong> Reconfirm flight and pet reservation; print documents; prep food/water plan.</li>
          <li><strong>Day of travel:</strong> Arrive early; follow airline check-in for pets.</li>
        </ul>

        <h3 class="h5 mt-4">Microchip</h3>
        <div>${microchipHtml}</div>

        <h3 class="h5 mt-4">Vaccinations</h3>
        <ul>${vaccHtml}</ul>

        <h3 class="h5 mt-4">Certifications &amp; Documents</h3>
        <ul>${certHtml}</ul>

        <h3 class="h5 mt-4">Origin-specific Requirements</h3>
        ${originHtml}

        ${moreHtml ? `<h3 class="h5 mt-4">Additional Notes</h3><div>${moreHtml}</div>` : ''}

        ${links ? `
        <h3 class="h5 mt-4">Helpful Links</h3>
        <ul>${links}</ul>` : ''}

        <div class="alert alert-info mt-3 small mb-0">
          I combine your database + official sources + AI. I’ll clearly label anything I infer for you.
          Always confirm critical details with your airline and border authorities.
        </div>
      </div>
    </div>
  `;
}

function renderAirlinePolicyCard(airline) {
  if (!airline) return '';
  const fullUrl = airline.slug ? `https://www.petvoyage.ai/airlines/${airline.slug}` : '';
  const idBase = 'air-' + (airline.slug || airline.airlineCode || Math.random().toString(36).slice(2));

  const inCabin          = airline.inCompartment;
  const inCabinAnimals   = Array.isArray(airline.inCompartmentAnimals) && airline.inCompartmentAnimals.length
    ? airline.inCompartmentAnimals.join(', ')
    : '—';
  const inCabinDetails   = airline.carrierCompartmentDetails || airline.inCompartmentDetails || '';

  const inCargo          = airline.inCargo;
  const inCargoAnimals   = Array.isArray(airline.inCargoAnimals) && airline.inCargoAnimals.length
    ? airline.inCargoAnimals.join(', ')
    : '—';
  const inCargoDetails   = airline.carrierCargoDetails || airline.inCargoDetails || '';

  const serviceDetails   = airline.serviceAnimalDetails || '';
  const esaDetails       = airline.esaDetails || '';
  const dangerList       = airline.dangerousBreedList || '';
  const brachyList       = airline.brachycephalicBreedList || '';
  const shipDetails      = airline.carrierCargoDetails || ''; // often same as cargo details

  const items = [];

  if (airline.microchip) {
    items.push(`
      <li class="mb-2">
        <strong>Microchip (airline):</strong> ${yn(airline.microchip)}
      </li>
    `);
  }
  if (airline.healthCertificate) {
    items.push(`
      <li class="mb-2">
        <strong>Health certificate (airline):</strong> ${yn(airline.healthCertificate)}
      </li>
    `);
  }

  if (inCabin) {
    const short = summarizeText(inCabinDetails);
    items.push(`
      <li class="mb-2">
        <strong>In-cabin allowed:</strong> ${yn(inCabin)} <span class="text-muted">(${escapeHtml(inCabinAnimals)})</span>
        ${detailsBlock(`${idBase}-cabin`, short, inCabinDetails)}
      </li>
    `);
  }

  if (inCargo) {
    const short = summarizeText(inCargoDetails);
    items.push(`
      <li class="mb-2">
        <strong>Checked/Cargo allowed:</strong> ${yn(inCargo)} <span class="text-muted">(${escapeHtml(inCargoAnimals)})</span>
        ${detailsBlock(`${idBase}-cargo`, short, inCargoDetails)}
      </li>
    `);
  }

  if (airline.serviceAnimals) {
    const short = summarizeText(serviceDetails);
    items.push(`
      <li class="mb-2">
        <strong>Service animals:</strong> ${yn(airline.serviceAnimals)}
        ${detailsBlock(`${idBase}-svc`, short, serviceDetails)}
      </li>
    `);
  }

  if (airline.esAnimals) {
    const short = summarizeText(esaDetails);
    items.push(`
      <li class="mb-2">
        <strong>Emotional support animals:</strong> ${yn(airline.esAnimals)}
        ${detailsBlock(`${idBase}-esa`, short, esaDetails)}
      </li>
    `);
  }

  if (airline.dangerousBreeds) {
    items.push(`
      <li class="mb-2">
        <strong>Restricted/dangerous breeds:</strong> ${yn(airline.dangerousBreeds)}
        ${dangerList ? `<div class="text-body-secondary small mt-1">${escapeHtml(dangerList)}</div>` : ''}
      </li>
    `);
  }
  if (airline.brachycephalic) {
    items.push(`
      <li class="mb-2">
        <strong>Brachycephalic (snub-nosed) restrictions:</strong> ${yn(airline.brachycephalic)}
        ${brachyList ? `<div class="text-body-secondary small mt-1">${escapeHtml(brachyList)}</div>` : ''}
      </li>
    `);
  }

  if (airline.petShipping) {
    const short = summarizeText(shipDetails || inCargoDetails);
    items.push(`
      <li class="mb-2">
        <strong>Separate pet shipping service:</strong> ${yn(airline.petShipping)}
        ${detailsBlock(`${idBase}-ship`, short, shipDetails || inCargoDetails)}
      </li>
    `);
  }

  const summary = airline.ImprovedPetPolicySummary || airline.PetPolicySummary || '';

  return `
    <div class="pv-airline card border-0 shadow-sm mb-4">
      <div class="card-body">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <h2 class="h4 m-0">Airline Requirements — ${escapeHtml(airline.name)}${airline.airlineCode ? ` (${escapeHtml(airline.airlineCode)})` : ''}</h2>
          ${fullUrl ? `<a class="badge rounded-pill text-bg-light border" href="${fullUrl}" target="_blank" rel="noopener">Full policy ↗</a>` : ''}
        </div>
        ${summary ? `<div class="mb-2 text-body-secondary">${sanitizeMinimal(summary)}</div>` : ''}
        ${items.length ? `<ul class="list-unstyled m-0">${items.join('')}</ul>` : `<div class="text-muted">No structured airline rules stored yet.</div>`}
      </div>
    </div>
  `;
}

function yn(v){ return v === 'yes' ? 'Yes' : (v === 'no' ? 'No' : '—'); }

module.exports = router;
