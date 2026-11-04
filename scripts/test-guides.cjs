const assert = require('node:assert/strict');
const express = require('express');
const ejs = require('ejs');
const path = require('node:path');
const cheerio = require('cheerio');
const guides = require('../content/guides.json');
(async () => {
  assert.equal(guides.length,5);
  assert.equal(new Set(guides.map(g=>g.slug)).size,5);
  const app=express();
  app.engine('ejs',(file,data,cb)=>ejs.renderFile(file,{...data,layout:()=>{}},cb));
  app.set('view engine','ejs'); app.set('views',path.join(__dirname,'../views'));
  app.use('/guides',require('../routes/guides'));
  app.use((req,res)=>res.status(404).send('Not found'));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const index=await fetch(`${base}/guides`);const indexHtml=await index.text();
    assert.equal(index.status,200);assert.ok(indexHtml.includes('Common planning questions'));
    for(const guide of guides){
      const response=await fetch(`${base}/guides/${guide.slug}?utm_source=facebook`);const body=await response.text();
      assert.equal(response.status,200);assert.equal(cheerio.load(body)('h1').text(),guide.title);assert.ok(body.includes('PetVoyage editorial team'));
      assert.ok(guide.html.length>1500);assert.ok(!/\]\(|<script|findAVet|collections\/must-have|— DRAFT/.test(guide.html));
      assert.ok(indexHtml.includes(`/guides/${guide.slug}`));
    }
    assert.equal((await fetch(`${base}/guides/not-a-guide`)).status,404);
    console.log('PASS: five unique published guide routes, complete SSR copy, FAQ/discovery links, no gated shopping or unverified vet-tool CTA, unknown guide404.');
  }finally{server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
