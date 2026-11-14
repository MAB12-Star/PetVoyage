(() => {
  const input=document.getElementById('journey-input');
  if(!input) return;
  const {plan,saved,signedIn}=JSON.parse(input.textContent);
  const status=document.getElementById('journey-status'),root=document.getElementById('journey-result'),flightOptions=document.getElementById('journey-flight-options');
  function el(tag,text,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
  function list(items){const ul=el('ul');(items||[]).forEach(t=>ul.append(el('li',t)));return ul;}
  function card(title,items,cls=''){const s=el('section',null,'pv-itinerary-card '+cls);if(title==='Prepare your bag'){const art=el('img',null,'pv-packing-art');art.src='/images/'+({cat:'Cat.png',bird:'Bird.png'}[plan.petType]||'Dog.png');art.alt='';art.loading='lazy';s.append(art);}s.append(el('h2',title),list(items));return s;}
  function link(label,url,cls){const a=el('a',label,cls);a.href=url;return a;}
  function details(value,holder,prefix=''){
    if(!value)return;
    if(typeof value==='string'){holder.append(el('p',(prefix?prefix+': ':'')+value));return;}
    Object.entries(value).forEach(([k,v])=>{if(['links','sources','recordUpdatedAt','name','speciesCategory'].includes(k))return;details(v,holder,/^\d+$/.test(k)?prefix:k.replace(/([A-Z])/g,' $1'));});
  }
  function evidence(data){
    const d=el('details',null,'pv-evidence');d.append(el('summary','Policy details & sources used'));
    d.append(el('p','These are the policy records supplied to Scout, not a new live source check. Review any origin, transit or species gaps before booking.','pv-fine-print'));
    for (const record of data.evidence?.species || [data.evidence]) {
      for (const [key, label] of [['country', 'Destination record'], ['airline', 'Airline record']]) {
        const info = record?.[key];
        if (!info) continue;
        const prefix = record.petType ? (record.petType === 'dog' ? 'Dog · ' : 'Cat · ') : '';
        d.append(el('h3', prefix + label));
        details(info,d);
        if(info.recordUpdatedAt)d.append(el('p','Record updated: '+new Date(info.recordUpdatedAt).toLocaleDateString()));
      }
    }
    const sources=el('ul');(data.sources||[]).forEach(s=>{if(!/^https?:\/\//i.test(s.url))return;const li=el('li'),a=link(s.name||'Official reference',s.url);a.target='_blank';a.rel='noopener noreferrer';li.append(a);sources.append(li);});
    d.append(sources);return d;
  }
  function show(data){
    status.setAttribute('aria-busy','false');
    root.replaceChildren();root.hidden=false;root.setAttribute('aria-busy','false');
    if(!data.result){status.replaceChildren(el('strong','Your policy details are available'),el('p',data.error||'Scout is temporarily unavailable.'));root.append(evidence(data));if(flightOptions)root.append(flightOptions);const retry=el('button','Try Scout again','pv-button');retry.type='button';retry.onclick=()=>location.reload();root.append(retry);return;}
    status.replaceChildren(el('span','✦','pv-scout-orb'),el('div',(saved?'Saved itinerary · ':'AI itinerary ready · ')+(data.plan.airlineName||'Airline not chosen')));
    const intro=el('section',null,'pv-journey-intro');intro.append(el('p','YOUR TRIP AT A GLANCE','pv-eyebrow'),el('p',data.result.summary,'pv-lead'));const photo=el('img',null,'pv-journey-pet-photo');photo.src='/images/'+({dog:'emma.jpg',cat:'backpack_cat.jpg',bird:'Bird.png'}[plan.petType]||'family.jpg');photo.alt='A companion from the PetVoyage photo and illustration collection';photo.loading='lazy';intro.append(photo);root.append(intro);
    const grid=el('div',null,'pv-itinerary-layout pv-itinerary-columns'+(data.plan.airlineName?' pv-itinerary-has-airline':'')),main=el('div',null,'pv-itinerary-column'),aside=el('div',null,'pv-itinerary-column');
    function policyCard(title, field, cls) {
      if (!data.result.species) return card(title, data.result[field], cls);
      const section = el('section', null, 'pv-itinerary-card ' + cls);
      section.append(el('h2', title));
      data.result.species.forEach(pet => {
        section.append(el('h3', pet.petType === 'dog' ? 'Dog' : 'Cat'), list(pet[field]));
      });
      return section;
    }
    main.append(policyCard('Destination requirements','destination','pv-destination-requirements'));
    if(flightOptions){flightOptions.className+=' pv-flight-sidebar';aside.append(flightOptions);}const packing=card('Prepare your bag',data.result.packing,'pv-packing-section');main.append(packing);
    const selection=el('div',null,'pv-trip-products');packing.append(selection);
    fetch('/trip-essentials?petType='+encodeURIComponent(data.plan.petType)).then(r=>r.ok?r.json():{products:[]}).then(({products})=>{
      if(!selection.isConnected||!Array.isArray(products)||!products.length)return;
      selection.append(el('h3','From our store · for your packing list'));
      products.slice(0,2).forEach(product=>{if(!/^[a-z0-9-]+$/.test(product.handle)||!/^https:\/\/cdn\.shopify\.com\//.test(product.image))return;
        const item=el('article',null,'pv-trip-product'),image=el('img');image.src=product.image;image.alt=product.title;image.loading='lazy';image.width=150;image.height=150;
        const copy=el('div');copy.append(el('h4',product.title),el('p',product.note),link('View current price & details →','https://petsvoyage.myshopify.com/products/'+product.handle+'?'+(Number.isSafeInteger(product.variantId)?'variant='+product.variantId+'&':'')+'utm_source=petvoyage&utm_medium=itinerary&utm_campaign=trip_essentials','pv-text-link'));item.append(image,copy);selection.append(item);
      });
      selection.append(el('p','Optional store suggestions. Check fit, delivery and your airline’s rules before purchase.','pv-fine-print'));
    }).catch(()=>{}); // Move the existing node; retain async results/listeners without refetching.
    if(data.plan.airlineName) aside.append(policyCard('Flying with '+data.plan.airlineName,'airline','pv-airline-section'));
    const timeline=el('section',null,'pv-itinerary-card pv-timeline-section');timeline.append(el('p','FROM NOW TO DEPARTURE','pv-eyebrow'),el('h2','Your preparation timeline'));
    const ol=el('ol',null,'pv-journey-timeline');data.result.timeline.forEach(t=>{const li=el('li');li.append(el('h3',t.when),el('p',t.action));ol.append(li)});timeline.append(ol);main.append(timeline);
    aside.append(card('Details still to confirm',data.result.questions,'pv-open-questions'));
    const vet=el('section',null,'pv-itinerary-card pv-vet-section');vet.append(el('h2','Plan your vet visit'),el('p','Find nearby clinics on our vet map, then confirm they provide the certificates and appointments your trip needs.'),link('Find nearby vets & health certificates','/findAVet','pv-button'));aside.append(vet);
    const tools=el('section',null,'pv-itinerary-card pv-trip-tools');tools.append(el('h2','Your next steps'));
    const actions=el('div',null,'pv-journey-actions');
    if(signedIn&&!saved){const btn=el('button','Save & open My To-Do','pv-button');btn.type='button';btn.onclick=async()=>{btn.disabled=true;try{const r=await fetch('/my-trips/itinerary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resultId:data.id})});const v=await r.json();if(!r.ok)throw Error(v.error||'Unable to save');location.assign(v.todoUrl||v.url)}catch(e){btn.disabled=false;btn.textContent=e.message}};actions.append(btn)}
    else if(saved){actions.append(link('Open My To-Do','/toDoList','pv-button'),link('Saved in My trips','/my-trips'));if(data.todoSync)tools.append(el('p',data.todoSync.added+' preparation tasks added to My To-Do when saved. You can edit and move them on your board.','pv-fine-print'));}
    else actions.append(link('Sign in to save your itinerary','/auth/login','pv-button'));
    if(!saved)tools.append(el('p','Saving this itinerary also adds its preparation steps to your editable My To-Do board.','pv-fine-print'));
    actions.append(link('My to-do board','/toDoList'));if(data.plan.flightNumber)tools.append(el('p','Your flight: '+data.plan.flightNumber+' · flight details supplied by you; schedule not verified','pv-fine-print'));
    actions.append(link('Search flights','/flights/searchFlights?'+new URLSearchParams(Object.fromEntries(['origin','destination','destinationCity','destinationAirport','flightNumber','petType','departureCity','departureAirport','departureDate','returnDate','departureConfirmed','departureMismatchConfirmed'].map(k=>[k,data.plan[k]??''])))),link('Find a vet','/findAVet'),link('Browse travel essentials','https://petsvoyage.myshopify.com/collections/all'));
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
    .catch(e=>{status.setAttribute('aria-busy','false');root.hidden=false;root.setAttribute('aria-busy','false');status.replaceChildren(el('strong','Scout could not finish this plan'),el('p',e.message));root.append(link('Edit trip details','#edit-journey','pv-button'));});
})();
