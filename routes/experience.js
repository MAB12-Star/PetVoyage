const express = require('express');
const router = express.Router();
const Country = require('../models/countryPetRegulationList');
const Story = require('../models/story');
const User = require('../models/User');
const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
async function countries() { return Country.find({}, 'destinationCountry regulationsByPetType').sort({ destinationCountry: 1 }).lean(); }
function planFrom(input, rows) {
  const origin = rows.find(c => c.destinationCountry === input.origin);
  const destination = rows.find(c => c.destinationCountry === input.destination);
  const petType = String(input.pet || input.petType || '');
  const departureDate = String(input.departure || input.departureDate || '');
  if (!origin || !destination || !['dog','cat','bird','other'].includes(petType) || (departureDate && !/^\d{4}-\d{2}-\d{2}$/.test(departureDate))) return null;
  const keys = Object.keys(destination.regulationsByPetType || {});
  // Only exact species or the common combined dog/cat category can be chosen safely.
  // 'Other' and broad bird labels must not accidentally select a specialist rule set.
  const key = keys.find(k => k.toLowerCase() === petType) || (['dog','cat'].includes(petType) ? keys.find(k => ['dog-cat','dogs-cats','dog-and-cat','dogs-and-cats'].includes(slug(k))) : undefined);
  return { origin: origin.destinationCountry, destination: destination.destinationCountry, petType, departureDate, countryUrl: key ? `/country/${encodeURIComponent(destination.destinationCountry)}?petType=${encodeURIComponent(slug(key))}` : '/getCountryRegulationList' };
}
router.get('/', async (req,res,next) => { try {
  const [rows, stories] = await Promise.all([countries(), Story.find({}).select('title slug summary photos authorName country createdAt').sort({createdAt:-1}).limit(3).lean()]);
  res.render('index', { countries: rows, stories, title: 'PetVoyage | Plan a thoughtful journey with your pet', canonicalUrl: 'https://www.petvoyage.ai/' });
} catch(e) { next(e); } });
router.get('/plan', async (req,res,next) => { try {
  const rows=await countries(); const plan=planFrom(req.query,rows);
  res.render('experience/plan',{ countries:rows, plan, title:'Research your pet’s journey | PetVoyage', robots:'noindex, follow' });
} catch(e) { next(e); } });
router.get('/my-trips', async (req,res,next) => { try {
  const user=req.user ? await User.findById(req.user._id).select('researchPlans savedItineraries').lean() : null;
  res.render('experience/trips',{ plans:user?.researchPlans || [], itineraries:user?.savedItineraries || [], title:'My trips | PetVoyage', robots:'noindex, nofollow' });
} catch(e) { next(e); } });
router.post('/my-trips', async (req,res,next) => { try {
  if (!req.user) return res.redirect('/auth/login');
  const plan=planFrom(req.body,await countries()); if (!plan) return res.status(400).send('Choose a listed origin, destination and pet type.');
  const user=await User.findById(req.user._id); if (!user) return res.sendStatus(401);
  const same=p=>p.origin===plan.origin && p.destination===plan.destination && p.petType===plan.petType && (p.departureDate || '')===plan.departureDate;
  if (!(user.researchPlans || []).some(same)) {
    if ((user.researchPlans || []).length>=100) return res.status(400).send('Your workspace has reached its 100 research-plan limit.');
    user.researchPlans.push({origin:plan.origin,destination:plan.destination,petType:plan.petType,departureDate:plan.departureDate}); await user.save();
  }
  res.redirect('/my-trips');
} catch(e) { next(e); } });
module.exports=router;
