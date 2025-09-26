// routes/ai.js
const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const CountryPetRegulation = require('../models/countryPetRegulationList'); // <-- adjust path if different
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





// Return airlines + countries (no global petTypes)
router.get('/pet-check/options', async (req, res) => {
  try {
    const airlines = await Airline.find({}, 'name airlineCode').sort('name').lean();
    const countriesDocs = await CountryPetRegulation.find({}, 'destinationCountry').sort('destinationCountry').lean();

    res.json({
      airlines: airlines.map(a => ({ _id: a._id, name: a.name, airlineCode: a.airlineCode })),
      countries: countriesDocs.map(d => d.destinationCountry)
    });
  } catch (e) {
    console.error('[AI] options error:', e);
    res.json({ airlines: [], countries: [] });
  }
});

// NEW: return the pet types for a given country
router.get('/pet-check/pet-types', async (req, res) => {
  try {
    const { country } = req.query;
    if (!country) return res.json({ petTypes: [] });

    const doc = await CountryPetRegulation.findOne({ destinationCountry: country }).lean();
    const map = doc?.regulationsByPetType || {};  // lean() gives plain object
    // Keys are your pet types (e.g., "dog","cat","bird"...)
    const petTypes = Object.keys(map);

    res.json({ petTypes });
  } catch (e) {
    console.error('[AI] pet-types error:', e);
    res.json({ petTypes: [] });
  }
});





// ---------- LOOKUP regulations by airline + country + pet (HTML itinerary) ----------
router.post('/pet-check', async (req, res) => {
  try {
    const { airlineId, airlineCode, country, petType, summarize } = req.body || {};

    if (!country || !petType || (!airlineId && !airlineCode)) {
      return res.status(400).json({ error: 'country, petType, and airlineId OR airlineCode are required.' });
    }

    // 1) Fetch airline + country docs
    const airlineQuery = airlineId ? { _id: airlineId } : { airlineCode: String(airlineCode).toUpperCase() };
    const airline = await Airline.findOne(airlineQuery).lean();
    if (!airline) return res.status(404).json({ error: 'Airline not found.' });

    const countryDoc = await CountryPetRegulation.findOne({ destinationCountry: country }).lean();
    if (!countryDoc) return res.status(404).json({ error: 'Country regulations not found.' });

    // 2) Normalize regs for the pet type
    const getFromMapOrObj = (container, key) => {
      if (!container) return null;
      if (container instanceof Map) return container.get(key) || null;
      if (container.get && typeof container.get === 'function') return container.get(key) || null;
      return container[key] || null;
    };
    const byType = getFromMapOrObj(countryDoc.regulationsByPetType, petType);

    const normalizeKV = (maybeMapOrObj) => {
      if (!maybeMapOrObj) return [];
      const entries =
        maybeMapOrObj instanceof Map
          ? Array.from(maybeMapOrObj.entries())
          : Object.entries(maybeMapOrObj);
      return entries.map(([name, obj]) => ({
        name,
        description: obj?.description || '',
        requirements: Array.isArray(obj?.requirements) ? obj.requirements : []
      }));
    };

    const regs = byType
      ? {
          microchip: byType.microchip || '',
          moreInfo: byType.moreInfo || '',
          vaccinations: normalizeKV(byType.vaccinations),
          certifications: normalizeKV(byType.certifications),
          links: Array.isArray(byType.links) ? byType.links : []
        }
      : null;

    const originRequirements = [];
    if (countryDoc.originRequirements) {
      const entries =
        countryDoc.originRequirements instanceof Map
          ? Array.from(countryDoc.originRequirements.entries())
          : Object.entries(countryDoc.originRequirements);
      for (const [key, val] of entries) {
        originRequirements.push({
          name: key,
          appliesTo: Array.isArray(val?.appliesTo) ? val.appliesTo : [],
          details: val?.details || ''
        });
      }
    }

    // 3) Figure out gaps we want AI to help fill
    const gaps = {
      microchip: !(regs && stripHtml(regs.microchip)),
      vaccinations: !(regs && Array.isArray(regs.vaccinations) && regs.vaccinations.length),
      certifications: !(regs && Array.isArray(regs.certifications) && regs.certifications.length),
      moreInfo: !(regs && stripHtml(regs.moreInfo)),
      originRequirements: originRequirements.length === 0
    };

    // 4) Build an itinerary HTML (Bootstrap-friendly). We always return pretty HTML.
    //    If AI key present, we ask AI to fill any missing sections and provide a short overview.
    let aiBlocks = { overview: '', microchip: '', vaccinations: '', certifications: '', origin: '', more: '' };

    if (client.apiKey) {
      try {
        const context = {
          airline: {
            name: airline.name || '',
            code: airline.airlineCode || '',
            petPolicyURL: airline.petPolicyURL || ''
          },
          country,
          petType,
          regs: {
            microchip: regs?.microchip || '',
            vaccinations: regs?.vaccinations || [],
            certifications: regs?.certifications || [],
            moreInfo: regs?.moreInfo || '',
            links: regs?.links || []
          },
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
          `Each value must be raw HTML with no surrounding code fences.`,
        ].join('\n');

        const r = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Return only the JSON object described. Keep outputs concise and helpful.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.4
        });

        // Try to parse JSON from AI
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

    // 5) Assemble final itinerary HTML (mix DB + AI where needed)
    const itineraryHtml = buildItineraryHtml({
      airline,
      country,
      petType,
      regs,
      originRequirements,
      aiBlocks,
      gaps
    });

    // Ship it
    return res.json({
      html: itineraryHtml,
      airline: { name: airline.name, code: airline.airlineCode, slug: airline.slug, petPolicyURL: airline.petPolicyURL || '' },
      country,
      petType
    });
  } catch (err) {
    console.error('[AI] /pet-check error:', err);
    return res.status(500).json({ error: 'Lookup failed.' });
  }
});

// ----------------- helpers -----------------
function stripHtml(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  return `<h4 class="mt-3">Origin-specific Requirements</h4><ul class="mb-0">${items}</ul>`;
}

function buildItineraryHtml({ airline, country, petType, regs, originRequirements, aiBlocks, gaps }) {
  const policyLink = airline.petPolicyURL
    ? `<a href="${escapeHtml(airline.petPolicyURL)}" target="_blank" rel="noopener">Airline Pet Policy</a>`
    : '';

  const header =
    `<div class="mb-3">
       <h3 class="mb-1">Itinerary & Requirements</h3>
       <p class="text-muted mb-0">${escapeHtml(petType)} • ${escapeHtml(airline.name)}${airline.airlineCode ? ` (${escapeHtml(airline.airlineCode)})` : ''} → ${escapeHtml(country)}</p>
       ${policyLink ? `<small>${policyLink}</small>` : ''}
     </div>`;

  const overview =
    `<div class="mb-3">
       
       ${aiBlocks.overview || `<ul class="mb-0"><li>Airline: ${escapeHtml(airline.name)}</li><li>Destination: ${escapeHtml(country)}</li><li>Pet: ${escapeHtml(petType)}</li></ul>`}
     </div>`;

  // Timeline is AI-driven general guidance; if overview already has bullets we keep it simple
  const timeline =
    `<div class="mb-3">
       <h4>Suggested Timeline</h4>
       <ul class="mb-0">
         <li><strong>T-30 days:</strong> Check microchip + vaccinations; book vet visit; review airline and destination rules.</li>
         <li><strong>T-10 days:</strong> Obtain/confirm any required health certificates; verify crate dimensions + labels.</li>
         <li><strong>T-48 hours:</strong> Reconfirm flight and pet reservation; print documents; prepare food/water plan.</li>
         <li><strong>Day of travel:</strong> Arrive early; have documents ready; follow airline check-in for pets.</li>
       </ul>
     </div>`;

  const microchipSection =
    `<div class="mb-3">
       <h4>Microchip</h4>
       ${
         regs && stripHtml(regs.microchip)
           ? regs.microchip
           : (aiBlocks.microchip || `<p><em>Unverified – AI completion. Confirm with official sources.</em> Ensure your pet has an ISO-compliant (11784/11785) microchip and that the chip number appears on all documents.</p>`)
       }
     </div>`;

  const vaccSection =
    (regs && Array.isArray(regs.vaccinations) && regs.vaccinations.length)
      ? bulletsFromKV(regs.vaccinations, 'Vaccinations')
      : `<div class="mb-3"><h4>Vaccinations</h4>${aiBlocks.vaccinations || `<p><em>Unverified – AI completion. Confirm with official sources.</em> Typical requirements include current rabies vaccination and up-to-date core vaccines per your vet’s guidance.</p>`}</div>`;

  const certSection =
    (regs && Array.isArray(regs.certifications) && regs.certifications.length)
      ? bulletsFromKV(regs.certifications, 'Certifications & Documents')
      : `<div class="mb-3"><h4>Certifications & Documents</h4>${aiBlocks.certifications || `<p><em>Unverified – AI completion. Confirm with official sources.</em> Expect a recent health certificate from a licensed vet and any destination-specific forms.</p>`}</div>`;

  const moreInfo =
    (regs && stripHtml(regs.moreInfo))
      ? `<div class="mb-3"><h4>Additional Notes</h4>${regs.moreInfo}</div>`
      : (aiBlocks.more ? `<div class="mb-3"><h4>Additional Notes</h4>${aiBlocks.more}</div>` : '');

  const origin =
    (originRequirements && originRequirements.length)
      ? originList(originRequirements)
      : (aiBlocks.origin ? `<div class="mb-3">${aiBlocks.origin}</div>` : '');

  const linksArray = []
    .concat((regs && regs.links) || [])
    .concat(countryDocLinksSafe(airline, country)); // airline policy already linked above; country official links added below via helper

  const links =
    linksArray.length
      ? `<div class="mb-3"><h4>Helpful Links</h4><ul class="mb-0">` +
        linksArray.map(l => `<li><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.name)}</a></li>`).join('') +
        `</ul></div>`
      : '';

  return `<div class="pv-itinerary">${header}${overview}${timeline}${microchipSection}${vaccSection}${certSection}${origin}${moreInfo}${links}</div>`;
}

// add this helper below; uses only safe airline/country links (country official links are embedded from regs context via client-side earlier if you want)
function countryDocLinksSafe(airline, country) {
  // You can extend this to include countryDoc.officialLinks if you prefer to pass them in.
  // Keeping minimal here—airline policy shown in header; return empty array.
  return [];
}


module.exports = router;
