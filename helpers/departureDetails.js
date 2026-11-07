// Manual departure checks only: no geolocation, network request or coordinates.
const us=new Set(['united states','united states of america','usa','us','mainland united states']);
function validDate(value){return !value || (/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value);}
function check(input={}){
 const departureCity=String(input.departureCity||'').trim().slice(0,100),departureAirport=String(input.departureAirport||'').trim().toUpperCase();
 const departureDate=String(input.departure||input.departureDate||''),returnDate=String(input.returnDate||'');
 const departureConfirmed=['true','on','1',true].includes(input.departureConfirmed),departureMismatchConfirmed=['true','on','1',true].includes(input.departureMismatchConfirmed);
 const fields={departureCity,departureAirport,departureDate,returnDate,departureConfirmed,departureMismatchConfirmed,departureSource:departureCity||departureAirport?'manual':'not-supplied'};
 if(!validDate(departureDate)||!validDate(returnDate))return {error:'Enter valid departure and return dates.',fields};
 if(returnDate&&(!departureDate||returnDate<departureDate))return {error:'Choose a departure date and a return date on or after it.',fields};
 if(departureAirport&&!/^[A-Z]{3}$/.test(departureAirport))return {error:'Enter a three-letter airport code, or leave the airport blank and use your city.',fields};
 if((departureCity||departureAirport)&&!departureConfirmed)return {error:'Confirm that you checked the departure country, city and airport before continuing.',fields};
 // Only LAX has reviewed country metadata in this small registry. Other codes remain manually supplied.
 if(departureAirport==='LAX'&&!us.has(String(input.origin||'').trim().toLowerCase())&&!departureMismatchConfirmed)return {error:'LAX is in the United States, while your origin country differs. Correct your departure or explicitly confirm that this difference is intentional.',fields};
 return {error:null,fields};
}
module.exports={check,validDate};
