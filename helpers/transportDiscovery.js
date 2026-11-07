const registry=require('../content/transportCandidates.json');
const normalized=value=>String(value||'').trim().toLowerCase();
module.exports=function transportDiscovery(plan={},now=new Date()) {
  if(plan.airlineId || plan.airline) return null;
  const origin=String(plan.origin||'').trim().slice(0,100),destination=String(plan.destination||'').trim().slice(0,100),petType=normalized(plan.petType||plan.pet);
  const ordinaryPathway=!plan.petPathway || plan.petPathway==='ordinary-pet';
  const candidates=registry.filter(r=>r.originCountries.some(c=>normalized(c)===normalized(origin)) && normalized(r.destinationCountry)===normalized(destination) && r.petType===petType && ordinaryPathway && r.pathway==='ordinary-pet' && now>=new Date(r.reviewedAt+'T00:00:00Z') && now<new Date(r.reviewDue+'T00:00:00Z'));
  const departureAirport=String(plan.departureAirport||'').trim().toUpperCase();
  const matches=candidates.map(r=>({...r,positioning:departureAirport===r.originAirport ? 'Your selected departure matches the reviewed Los Angeles enquiry gateway. Exact cargo service still needs confirmation.' : 'No connecting animal itinerary is verified from your departure. Ask the shipper whether positioning to Los Angeles is possible.'}));
  return {state:matches.length?'reviewed-enquiry':'not-reviewed',candidates:matches,origin,destination,petType,
    summary:matches.length?'Australia ordinary-pet dog exception: the reviewed pathway uses manifest cargo, separate from your passenger ticket. Confirm the government pathway and all shipment conditions before booking.':'No reviewed transport candidate is available for this selection yet. This does not mean travel is prohibited. Confirm destination requirements and each operating airline’s policy.',
    passenger:{mode:'passenger search only',confirmed:!!(plan.departureCity||plan.departureAirport)&&(plan.departureConfirmed===true||plan.departureConfirmed==='true'),departureCity:plan.departureCity||'',departureAirport:plan.departureAirport||'',departureDate:plan.departureDate||'',returnDate:plan.returnDate||'',url:'https://www.google.com/travel/flights?q='+encodeURIComponent('Flights from '+(plan.departureConfirmed===true||plan.departureConfirmed==='true'?(plan.departureAirport||plan.departureCity||origin):origin)+' to '+destination+(plan.departureDate?' departing '+plan.departureDate:'')+(plan.returnDate?' returning '+plan.returnDate:'')),note:'External passenger search only. No live fares, operating flight, pet space or animal transfer has been checked.'},
    assistanceNote:(petType==='assistance'||plan.petPathway==='assistance')?'Assistance dogs require a separate government and airline assessment; this ordinary-pet registry does not determine that pathway.':null,
    transitNote:plan.transit?'Transit countries supplied in your plan have not been verified for animal transfer. Confirm every leg and transit clearance separately.':null};
};
