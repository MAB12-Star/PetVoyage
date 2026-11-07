(() => {
  const input=document.getElementById('journey-input');
  if(!input) return;
  const {plan,saved,signedIn}=JSON.parse(input.textContent);
  const status=document.getElementById('journey-status'),root=document.getElementById('journey-result'),flightOptions=document.getElementById('journey-flight-options');
  function el(tag,text,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
  function list(items){const ul=el('ul');(items||[]).forEach(t=>ul.append(el('li',t)));return ul;}
  function card(title,items,cls=''){const s=el('section',null,'pv-itinerary-card '+cls);s.append(el('h2',title),list(items));return s;}
  function link(label,url,cls){const a=el('a',label,cls);a.href=url;return a;}
  function details(value,holder,prefix=''){
    if(!value)return;
    if(typeof value==='string'){holder.append(el('p',(prefix?prefix+': ':'')+value));return;}
    Object.entries(value).forEach(([k,v])=>{if(['links','sources','recordUpdatedAt','name','speciesCategory'].includes(k))return;details(v,holder,/^\d+$/.test(k)?prefix:k.replace(/([A-Z])/g,' $1'));});
  }
  function evidence(data){
    const d=el('details',null,'pv-evidence');d.append(el('summary','Policy details & sources used'));
    d.append(el('p','These are the policy records supplied to Scout, not a new live source check. Review any origin, transit or species gaps before booking.','pv-fine-print'));
    for(const [key,label] of [['country','Destination record'],['airline','Airline record']]){
      const info=data.evidence?.[key];if(!info)continue;
      d.append(el('h3',label));details(info,d);
      if(info.recordUpdatedAt)d.append(el('p','Record updated: '+new Date(info.recordUpdatedAt).toLocaleDateString()));
    }
    const sources=el('ul');(data.sources||[]).forEach(s=>{if(!/^https?:\/\//i.test(s.url))return;const li=el('li'),a=link(s.name||'Official reference',s.url);a.target='_blank';a.rel='noopener noreferrer';li.append(a);sources.append(li);});
    d.append(sources);return d;
  }
  function show(data){
    root.replaceChildren();root.hidden=false;root.setAttribute('aria-busy','false');
    if(!data.result){status.replaceChildren(el('strong','Your policy details are available'),el('p',data.error||'Scout is temporarily unavailable.'));root.append(evidence(data));if(flightOptions)root.append(flightOptions);const retry=el('button','Try Scout again','pv-button');retry.type='button';retry.onclick=()=>location.reload();root.append(retry);return;}
    status.replaceChildren(el('span','✦','pv-scout-orb'),el('div',(saved?'Saved itinerary · ':'AI itinerary ready · ')+(data.plan.airlineName||'Airline not chosen')));
    const intro=el('section',null,'pv-journey-intro');intro.append(el('p','YOUR TRIP AT A GLANCE','pv-eyebrow'),el('p',data.result.summary,'pv-lead'));const photo=el('img',null,'pv-journey-pet-photo');photo.src='/images/babies.jpg';photo.alt='The PetVoyage family pets together';photo.loading='lazy';intro.append(photo);root.append(intro);
    const grid=el('div',null,'pv-itinerary-layout'),main=el('div',null,'pv-itinerary-main'),aside=el('aside',null,'pv-itinerary-aside');
    main.append(card('Destination requirements',data.result.destination));
    if(flightOptions)main.append(flightOptions); // Move the existing node; retain async results/listeners without refetching.
    if(data.plan.airlineName) main.append(card('Flying with '+data.plan.airlineName,data.result.airline));
    const timeline=el('section',null,'pv-itinerary-card');timeline.append(el('p','FROM NOW TO DEPARTURE','pv-eyebrow'),el('h2','Your preparation timeline'));
    const ol=el('ol',null,'pv-journey-timeline');data.result.timeline.forEach(t=>{const li=el('li');li.append(el('h3',t.when),el('p',t.action));ol.append(li)});timeline.append(ol);main.append(timeline);
    aside.append(card('Prepare your bag',data.result.packing),card('Details still to confirm',data.result.questions,'pv-open-questions'));
    const tools=el('section',null,'pv-itinerary-card');tools.append(el('h2','Your next steps'));
    const actions=el('div',null,'pv-journey-actions');
    if(signedIn&&!saved){const btn=el('button','Save itinerary to My trips','pv-button');btn.type='button';btn.onclick=async()=>{btn.disabled=true;try{const r=await fetch('/my-trips/itinerary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resultId:data.id})});const v=await r.json();if(!r.ok)throw Error(v.error||'Unable to save');location.assign(v.url)}catch(e){btn.disabled=false;btn.textContent=e.message}};actions.append(btn)}
    else if(saved)actions.append(link('Saved in My trips','/my-trips','pv-button'));
    else actions.append(link('Sign in to save your itinerary','/auth/login','pv-button'));
    actions.append(link('Search flights','/flights/searchFlights?'+new URLSearchParams(Object.fromEntries(['origin','destination','destinationCity','destinationAirport','petType','departureCity','departureAirport','departureDate','returnDate','departureConfirmed','departureMismatchConfirmed'].map(k=>[k,data.plan[k]??''])))),link('Find a vet','/findAVet'),link('Browse travel essentials','https://petsvoyage.myshopify.com/collections/all'));
    const print=el('button','Print itinerary','pv-text-button');print.type='button';print.onclick=()=>window.print();actions.append(print);tools.append(actions);aside.append(tools);grid.append(main,aside);root.append(grid,evidence(data));
    root.append(el('p','Generated '+new Date(data.generatedAt).toLocaleString()+'. Saved plans retain this version; rebuild when your route or policies change.','pv-fine-print'));
  }
  const edit=document.getElementById('edit-journey');
  const openEdit=()=>{if(location.hash==='#edit-journey')edit.open=true;};
  window.addEventListener('hashchange',openEdit);openEdit();
  document.querySelectorAll('a[href="#edit-journey"]').forEach(a=>a.addEventListener('click',()=>{edit.open=true}));
  if(saved){show(saved);return;}
  fetch('/ai/journey',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(plan)})
    .then(async r=>{const data=await r.json();if(!r.ok&&!data.evidence)throw Error(data.error||'Unable to build itinerary');show(data)})
    .catch(e=>{root.hidden=false;root.setAttribute('aria-busy','false');status.replaceChildren(el('strong','Scout could not finish this plan'),el('p',e.message));root.append(link('Edit trip details','#edit-journey','pv-button'));});
})();
