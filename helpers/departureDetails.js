// Manual departure checks only: no geolocation, network request or coordinates.
function validDate(value){return !value || (/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value);}
function check(input={}){
 const departureCity=String(input.departureCity||'').trim().slice(0,100),departureAirport=String(input.departureAirport||'').trim().toUpperCase();
 const departureDate=String(input.departure||input.departureDate||''),returnDate=String(input.returnDate||'');
 const departureConfirmed=!!(departureCity||departureAirport),departureMismatchConfirmed=false;
 const destination=require('./destinationDetails').check(input);
 const fields={...destination.fields,flightNumber:String(input.flightNumber||'').trim().toUpperCase().replace(/[^A-Z0-9 -]/g,'').slice(0,16),departureCity,departureAirport,departureDate,returnDate,departureConfirmed,departureMismatchConfirmed,departureSource:departureCity||departureAirport?(input.departureSource==='location'?'location-suggested':'manual'):'not-supplied'};
 if(destination.error)return {error:destination.error,fields};
 if(!validDate(departureDate)||!validDate(returnDate))return {error:'Enter valid departure and return dates.',fields};
 if(returnDate&&(!departureDate||returnDate<departureDate))return {error:'Choose a departure date and a return date on or after it.',fields};
 if(departureAirport&&!/^[A-Z]{3}$/.test(departureAirport))return {error:'Enter a three-letter airport code, or leave the airport blank and use your city.',fields};
 // Only LAX has reviewed country metadata in this small registry. Other codes remain manually supplied.
 return {error:null,fields};
}
function matches(from,input={}){const raw=String(from||'').split(/→|->/)[0].split(/\bvia\b/i)[0].trim(),normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\([A-Z]{3}\)/gi,'').toLowerCase().replace(/[^a-z0-9]/g,'').replace(/internationalairport|international|airport|intl/g,'');const code=String(input.departureAirport||'').trim().toUpperCase(),requested=normalize(input.departureCity),candidate=normalize(raw);if(!code&&!requested)return true;if(!candidate)return false;const hasCode=c=>raw.toUpperCase()===c||Array.from(raw.matchAll(/\(([A-Z]{3})\)/gi)).some(m=>m[1].toUpperCase()===c)||raw.toUpperCase().split(/[,\s]+/).at(-1)===c;if(code){if(hasCode(code))return true;if(code==='OAK')return ['oakland','oaklandsanfranciscobay','sanfranciscobayoakland','metropolitanoakland'].includes(candidate);if(code==='LAX')return candidate==='losangeles';return false;}if(['oakland','oaklandsanfranciscobay','sanfranciscobayoakland','metropolitanoakland','oak'].includes(requested))return ['oakland','oaklandsanfranciscobay','sanfranciscobayoakland','metropolitanoakland','oak'].includes(candidate)||hasCode('OAK');if(requested==='losangeles'||requested==='lax')return candidate==='losangeles'||hasCode('LAX');return requested===candidate;}
module.exports={check,validDate,matches};
