// Manual departure checks only: no geolocation, network request or coordinates.
function validDate(value){return !value || (/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value);}
function check(input={}){
 const departureCity=String(input.departureCity||'').trim().slice(0,100),departureAirport=String(input.departureAirport||'').trim().toUpperCase();
 const departureDate=String(input.departure||input.departureDate||''),returnDate=String(input.returnDate||'');
 const departureConfirmed=!!(departureCity||departureAirport),departureMismatchConfirmed=false;
 const fields={departureCity,departureAirport,departureDate,returnDate,departureConfirmed,departureMismatchConfirmed,departureSource:departureCity||departureAirport?(input.departureSource==='location'?'location-suggested':'manual'):'not-supplied'};
 if(!validDate(departureDate)||!validDate(returnDate))return {error:'Enter valid departure and return dates.',fields};
 if(returnDate&&(!departureDate||returnDate<departureDate))return {error:'Choose a departure date and a return date on or after it.',fields};
 if(departureAirport&&!/^[A-Z]{3}$/.test(departureAirport))return {error:'Enter a three-letter airport code, or leave the airport blank and use your city.',fields};
 // Only LAX has reviewed country metadata in this small registry. Other codes remain manually supplied.
 return {error:null,fields};
}
module.exports={check,validDate};
