const {randomUUID,createHash}=require('node:crypto');const pilot=require('./airlineWebResearch');
const keyFor=scope=>createHash('sha256').update(JSON.stringify(pilot.scopeFor(scope))).digest('hex');
function start(req,scope){const safe=pilot.scopeFor(scope),key=keyFor(safe);if(req.session.flightOptionSearch?.key===key)return req.session.flightOptionSearch.id;const value={id:randomUUID(),key,scope:safe,attempted:false};req.session.flightOptionSearch=value;return value.id;}
function match(req,scope){const value=req.session?.flightOptionSearch;if(!value||req.query?.searchId!==value.id)return null;try{return keyFor(scope)===value.key?value.id:null}catch{return null}}
function sameSite(req){if(req.get('sec-fetch-site')==='cross-site')return false;const origin=req.get('origin');if(!origin)return true;try{return origin===new URL(process.env.PUBLIC_BASE_URL||'https://www.petvoyage.ai').origin}catch{return false}}
module.exports={start,match,keyFor,sameSite};
