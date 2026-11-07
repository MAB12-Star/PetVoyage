const express = require('express');
const router = express.Router();
const Country = require('../models/countryPetRegulationList');
const Story = require('../models/story');
const User = require('../models/User');
const Airline = require('../models/airline');
const { randomUUID } = require('node:crypto');
const journey = require('../helpers/journeyPlanner');
const discoverTransport = require('../helpers/transportDiscovery');
const departureDetails = require('../helpers/departureDetails');
let aiDay = '', aiCount = 0, inFlight = 0, researchInFlight=false;
async function airlines() { return Airline.find({}, 'name airlineCode slug').sort({name:1}).lean(); }
function allowedPlannerRequest(req) {
  if(req.get('sec-fetch-site')==='cross-site') return false;
  const origin=req.get('origin');
  if(!origin) return true;
  // TLS terminates at nginx. The app's internal protocol is not the browser origin.
  // Use a configured public address, never arbitrary forwarded headers or Host input.
  try { return origin===new URL(process.env.PUBLIC_BASE_URL || 'https://www.petvoyage.ai').origin; }
  catch { return false; }
}
const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
async function countries() { return Country.find({}, 'destinationCountry regulationsByPetType').sort({ destinationCountry: 1 }).lean(); }
function planFrom(input, rows) {
  const origin = rows.find(c => c.destinationCountry === input.origin);
  const destination = rows.find(c => c.destinationCountry === input.destination);
  const petType = String(input.pet || input.petType || '');
  const checkedDeparture = departureDetails.check(input);
  if(checkedDeparture.error) return null;
  const {departureDate}=checkedDeparture.fields;
  if (!origin || !destination || !['dog','cat','bird','other'].includes(petType) || (departureDate && !/^\d{4}-\d{2}-\d{2}$/.test(departureDate))) return null;
  const keys = Object.keys(destination.regulationsByPetType || {});
  // Only exact species or the common combined dog/cat category can be chosen safely.
  // 'Other' and broad bird labels must not accidentally select a specialist rule set.
  const key = keys.find(k => k.toLowerCase() === petType) || (['dog','cat'].includes(petType) ? keys.find(k => ['dog-cat','dogs-cats','dog-and-cat','dogs-and-cats'].includes(slug(k))) : undefined);
  return { ...checkedDeparture.fields, petPathway: input.petPathway==='assistance' ? 'assistance' : 'ordinary-pet', origin: origin.destinationCountry, destination: destination.destinationCountry, petType, departureDate, airlineId: /^[a-f0-9]{24}$/i.test(String(input.airline || input.airlineId || '')) ? String(input.airline || input.airlineId) : '', transit: String(input.transit || '').slice(0,200), countryUrl: key ? `/country/${encodeURIComponent(destination.destinationCountry)}?petType=${encodeURIComponent(slug(key))}` : '/getCountryRegulationList' };
}
router.get('/', async (req,res,next) => { try {
  const [rows, stories] = await Promise.all([countries(), Story.find({}).select('title slug summary photos authorName country createdAt').sort({createdAt:-1}).limit(3).lean()]);
  res.render('index', { countries: rows, airlines:await airlines(), stories, title: 'PetVoyage | Plan a thoughtful journey with your pet', canonicalUrl: 'https://www.petvoyage.ai/' });
} catch(e) { next(e); } });
router.post('/plan/start',async(req,res,next)=>{try{if(!allowedPlannerRequest(req))return res.sendStatus(403);const plan=planFrom(req.body,await countries());if(!plan)return res.status(400).send((departureDetails.check(req.body).error||'Please check your trip details.')+' <a href="/">Return to the planner</a>');const params=new URLSearchParams(Object.entries(plan).filter(([,v])=>typeof v==='string'||typeof v==='boolean'));if(!plan.airlineId)params.set('searchId',require('../helpers/flightSearchIntent').start(req,plan));res.redirect(303,'/plan?'+params);}catch(e){next(e)}});
router.get('/plan', async (req,res,next) => { try {
  const rows=await countries(); let plan=planFrom(req.query,rows); let savedJourney=null;
  if(req.query.saved && req.user && /^[a-f0-9]{24}$/i.test(req.query.saved)) {
    const user=await User.findById(req.user._id).select('researchPlans').lean();
    const saved=user?.researchPlans?.find(p=>String(p._id)===req.query.saved);
    if(saved?.generatedPlan){savedJourney=saved.generatedPlan;plan=savedJourney.plan;}
  }
  res.render('experience/plan',{ countries:rows, airlines:await airlines(), plan, savedJourney, transportDiscovery: plan ? discoverTransport(plan) : null, validationError: departureDetails.check(req.query).error, autoSearchId: plan ? require('../helpers/flightSearchIntent').match(req,plan) : null, title:'Your AI pet travel itinerary | PetVoyage', robots:'noindex, follow' });
} catch(e) { next(e); } });
router.post('/ai/journey', async (req,res) => {
  res.set('Cache-Control','no-store');
  // Only the same-site planner may generate paid requests or overwrite the session result.
  if(!allowedPlannerRequest(req)) return res.status(403).json({error:'Open the planner on PetVoyage to build your itinerary.'});
  try {
    const plan=planFrom(req.body,await countries());
    if(!plan) return res.status(400).json({error:'Check your departure location/confirmation and dates, and choose a listed origin, destination and pet type.'});
    if((req.body.airline || req.body.airlineId) && !plan.airlineId) return res.status(400).json({error:'Choose an airline from the list.'});
    const destination=await Country.findOne({destinationCountry:plan.destination}).lean();
    const airline=plan.airlineId ? await Airline.findById(plan.airlineId).lean() : null;
    if(plan.airlineId && !airline) return res.status(400).json({error:'That airline is unavailable. Please choose again.'});
    const context=journey.contextFor(plan,destination,airline);
    const sources=[...context.destination.sources,...(context.airline?.sources || [])];
    const evidence={country:context.destination,airline:context.airline};
    const transportDiscovery=discoverTransport(plan);
    const key=process.env.OPENAI_API_KEY || process.env.openaiKey;
    if(!key) return res.status(503).json({error:'Scout cannot generate an itinerary right now. Your available policy details are below; try again shortly.',evidence,sources,transportDiscovery});
    const now=Date.now(),day=new Date().toISOString().slice(0,10);
    if(day!==aiDay){aiDay=day;aiCount=0;}
    const limit=req.session.journeyUsage || {start:now,count:0};
    if(now-limit.start>3600000){limit.start=now;limit.count=0;}
    if(limit.count>=8 || aiCount>=100 || inFlight>=3) return res.status(429).json({error:'Scout is busy. Please try again later; your policy details are still available below.',evidence,sources,transportDiscovery});
    limit.count++;req.session.journeyUsage=limit;aiCount++;inFlight++;
    let result;
    try {
      const OpenAI=require('openai');
      result=await journey.generate(context,new OpenAI({apiKey:key}));
    } catch(error) {
      console.warn('[journey] AI generation unavailable',error.status || error.name);
      return res.status(503).json({error:'Scout could not finish your itinerary. Your policy details are available below. Try building it again shortly.',evidence,sources,transportDiscovery});
    } finally {inFlight--;}
    const value={id:randomUUID(),plan:{...plan,airlineName:airline?.name || ''},result,sources,evidence,transportDiscovery,generatedAt:new Date().toISOString()};
    req.session.latestJourney=value;
    return res.json(value);
  } catch(error){console.warn('[journey] lookup failed',error.name);return res.status(500).json({error:'We could not load the policies for this route. Please try again.'});}
});
router.get('/ai/airline-research/cache',async(req,res)=>{res.set('Cache-Control','no-store');try{const cached=await require('../helpers/airlineWebResearch').readCache(require('mongoose').connection.db,req.query);if(cached){const {estimatedUsd,reservedUsd,attempt,...publicResult}=cached;return res.json(publicResult);}return res.json({cached:false});}catch{return res.json({cached:false});}});
router.post('/ai/flight-options',async(req,res)=>{
 if(!allowedPlannerRequest(req))return res.sendStatus(403);const intent=req.session.flightOptionSearch;if(!intent||req.body.searchId!==intent.id)return res.status(403).json({error:'Submit your flight search first.'});
 if(intent.result)return res.json(intent.result);if(intent.attempted||researchInFlight)return res.status(202).json({pending:true});
 const now=Date.now();if(req.session.lastWebResearchAt&&now-req.session.lastWebResearchAt<60000){intent.attempted=true;intent.result={status:429,cards:[],error:'More options are not available right now.'};return res.status(429).json(intent.result);}
 req.session.lastWebResearchAt=now;intent.attempted=true;researchInFlight=true;
 try{if(typeof req.session.save==='function')await new Promise((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));const key=process.env.OPENAI_API_KEY||process.env.openaiKey;if(!key)throw Error('Unavailable');
 const result=await require('../helpers/airlineWebResearch').run({db:require('mongoose').connection.db,client:new(require('openai'))({apiKey:key,maxRetries:0}),input:intent.scope});const {estimatedUsd,reservedUsd,attempt,...publicResult}=result;intent.result=publicResult;return res.status(result.status).json(publicResult);
 }catch{intent.result={status:503,cards:[],error:'More options are unavailable right now.'};return res.status(503).json(intent.result);}finally{researchInFlight=false;}
});
router.post('/my-trips/itinerary', async (req,res,next)=>{try{
  if(!req.user) return res.status(401).json({error:'Sign in to save this itinerary.'});
  if(!allowedPlannerRequest(req)) return res.sendStatus(403);
  const value=req.session.latestJourney;
  if(!value || req.body.resultId!==value.id) return res.status(400).json({error:'Build this itinerary again before saving.'});
  const user=await User.findById(req.user._id);
  if(!user) return res.sendStatus(401);
  const existing=user.researchPlans.find(p=>p.generatedPlan?.id===value.id);
  if(existing) return res.json({url:'/plan?saved='+existing._id});
  if(user.researchPlans.length>=100) return res.status(400).json({error:'Your workspace has reached its 100-plan limit.'});
  user.researchPlans.push({...value.plan,generatedPlan:value});await user.save();
  res.json({url:'/plan?saved='+user.researchPlans[user.researchPlans.length-1]._id});
}catch(e){next(e)}});
router.get('/my-trips', async (req,res,next) => { try {
  const user=req.user ? await User.findById(req.user._id).select('researchPlans savedItineraries').lean() : null;
  res.render('experience/trips',{ plans:user?.researchPlans || [], itineraries:user?.savedItineraries || [], title:'My trips | PetVoyage', robots:'noindex, nofollow' });
} catch(e) { next(e); } });
router.post('/my-trips', async (req,res,next) => { try {
  if (!req.user) return res.redirect('/auth/login');
  const plan=planFrom(req.body,await countries()); if (!plan) return res.status(400).send('Choose a listed origin, destination and pet type.');
  const user=await User.findById(req.user._id); if (!user) return res.sendStatus(401);
  const same=p=>p.origin===plan.origin && p.destination===plan.destination && p.petType===plan.petType && (p.departureDate || '')===plan.departureDate && (p.departureCity || '')===plan.departureCity && (p.departureAirport || '')===plan.departureAirport && (p.returnDate || '')===plan.returnDate && (p.destinationCity || '')===plan.destinationCity && (p.destinationAirport || '')===plan.destinationAirport;
  if (!(user.researchPlans || []).some(same)) {
    if ((user.researchPlans || []).length>=100) return res.status(400).send('Your workspace has reached its 100 research-plan limit.');
    user.researchPlans.push({...plan}); await user.save();
  }
  res.redirect('/my-trips');
} catch(e) { next(e); } });
module.exports=router;
