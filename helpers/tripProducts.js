const picks=require('../content/tripProducts.json');
let cache=null,until=0,pending;
async function load(){
 if(cache && Date.now()<until)return cache;
 if(pending)return pending;
 pending=Promise.all(picks.map(async pick=>{try{
 const response=await fetch('https://petsvoyage.myshopify.com/products/'+pick.handle+'.js',{signal:AbortSignal.timeout(4000)});
 if(!response.ok)return null;const live=await response.json();
 if(live.id!==pick.id || live.handle!==pick.handle || !live.available || !live.variants?.some(v=>v.available))return null;
 const variant=pick.variantId ? live.variants.find(v=>v.id===pick.variantId && v.available) : null;if(pick.variantId&&!variant)return null;
 let image=String(variant?.featured_image?.src||live.featured_image||'');if(image.startsWith('//'))image='https:'+image;if(!image.startsWith('https://cdn.shopify.com/'))return null;
 return {...pick,title:String(live.title)+(variant?' — Purple':''),image,url:'https://petsvoyage.myshopify.com/products/'+pick.handle+(variant?'?variant='+variant.id:'')};
 }catch{return null;}})).then(rows=>{cache=rows.filter(Boolean);until=Date.now()+120000;return cache;}).finally(()=>{pending=null;});return pending;
}
async function available(species){const rows=await load();return rows.filter(p=>species==='all'||p.species.includes(species));}
module.exports={available};
