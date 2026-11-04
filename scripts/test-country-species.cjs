const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ejs = require('ejs');
const cheerio = require('cheerio');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'routes/countryRegulationList.js'), 'utf8');
const template = fs.readFileSync(path.join(root, 'views/regulations/showCountry.ejs'), 'utf8');
const layout = fs.readFileSync(path.join(root, 'views/layouts/boilerplate.ejs'), 'utf8');
const routes = [];
let fixture;
vm.runInNewContext(source, {
  module: { exports: {} },
  console: { log() {}, error() {}, warn() {} },
  process: { env: { BASE_URL: 'https://www.petvoyage.ai' } },
  require(name) {
    if (name === 'express') return { Router: () => ({ get(route, ...handlers) { routes.push({ route, handlers }); } }) };
    if (name === '../models/countryPetRegulationList') return { findOne() { return { lean: async () => structuredClone(fixture) }; } };
    if (name === '../middleware') return { attachAds() {} };
    if (name === 'mongoose') return { connection: {} };
    throw new Error(`Unexpected import: ${name}`);
  }
});
const show = routes.find(route => route.route === '/country/:country').handlers.at(-1);
const makeFixture = () => ({
  _id: 'fixture-country', destinationCountry: 'Test & Country',
  updatedAt: '2026-10-28T15:29:08.651Z',
  regulationsByPetType: {
    'Dog & Cat': { microchip: 'DOG_CAT_ONLY_REQUIREMENT', certifications: { Certificate: { description: 'DOG_CAT_ONLY_CERTIFICATE' } } },
    Ferrets: { microchip: 'FERRET_ONLY_REQUIREMENT', certifications: { Certificate: { description: 'FERRET_ONLY_CERTIFICATE' } } },
    '$_transient': { microchip: 'TRANSIENT_INTERNAL_DATA' }
  },
  originRequirements: {
    'dog-origin': { appliesTo: ['Dog & Cat'], details: 'DOG_CAT_ONLY_ORIGIN' },
    'ferret-origin': { appliesTo: ['Ferrets'], details: 'FERRET_ONLY_ORIGIN' },
    shared: { appliesTo: [], details: 'SHARED_ORIGIN_NOTE' }
  },
  officialLinks: [{ name: 'Official source', url: 'https://example.gov/pets' }]
});
async function request(petType, country = 'Test & Country') {
  fixture = makeFixture();
  let result;
  const req = { params: { country }, query: petType === undefined ? {} : { petType } };
  const res = {
    locals: {},
    redirect(status, url) { result = { redirect: status, url }; },
    status(status) { return { send(message) { result = { status, message }; } }; },
    render(view, data) { result = { view, data }; }
  };
  await show(req, res);
  return result;
}
(async () => {
  for (const [slug, selected, included, excluded] of [
    ['dog-cat', 'Dog & Cat', 'DOG_CAT', 'FERRET'],
    ['ferrets', 'Ferrets', 'FERRET', 'DOG_CAT']
  ]) {
    const result = await request(slug);
    assert.equal(result.view, 'regulations/showCountry');
    assert.equal(result.data.selectedPetType, selected);
    const expectedUrl = `https://www.petvoyage.ai/country/Test%20%26%20Country?petType=${slug}`;
    assert.equal(result.data.canonicalUrl, expectedUrl);
    assert.equal(result.data.ogUrl, expectedUrl);
    assert.equal(result.data.jsonLd.mainEntityOfPage['@id'], expectedUrl);
    const html = ejs.render(template, { ...result.data, layout() {}, include() { return ''; } });
    const $ = cheerio.load(html);
    assert.equal($('.pet-regulation-section').length, 1);
    assert.equal($('.pet-regulation-section').attr('data-pet'), selected);
    assert.ok(!($('.pet-regulation-section').attr('style') || '').includes('display:none'));
    assert.ok(html.includes(`${included}_ONLY_REQUIREMENT`));
    assert.ok(html.includes(`${included}_ONLY_CERTIFICATE`));
    assert.ok(html.includes(`${included}_ONLY_ORIGIN`));
    assert.ok(html.includes('SHARED_ORIGIN_NOTE'));
    assert.ok(!html.includes(`${excluded}_ONLY_`), 'Other species rule text must be absent, not hidden');
    assert.ok(!html.includes('TRANSIENT_INTERNAL_DATA'));
    assert.equal($('a.pet-type-btn').length, 2);
    assert.equal($('button.pet-type-btn').length, 0);
    assert.equal($('a.pet-type-btn[aria-current="page"]').attr('href'), `/country/Test%20%26%20Country?petType=${slug}`);
    assert.ok($('a.pet-type-btn').toArray().every(a => $(a).attr('href').startsWith('/country/Test%20%26%20Country?petType=')));
    const full = ejs.render(layout, { ...result.data, body: html, include() { return ''; } });
    const page = cheerio.load(full);
    assert.equal(page('link[rel="canonical"]').length, 1);
    assert.equal(page('link[rel="canonical"]').attr('href'), expectedUrl);
    assert.equal(page('h1').text(), `Pet Travel Requirements for Test & Country — ${selected}`);
  }
  for (const petType of [undefined, 'DOG & CAT', 'dog cat', 'unknown-species']) {
    const result = await request(petType);
    assert.equal(result.redirect, 301);
    assert.equal(result.url, '/country/Test%20%26%20Country?petType=dog-cat');
  }
  const caseAlias = await request('ferrets', 'test & country');
  assert.equal(caseAlias.redirect, 301);
  assert.equal(caseAlias.url, '/country/Test%20%26%20Country?petType=ferrets');
  console.log('PASS: selected-species SSR only; filtered origin rules; non-JS species links; canonical/H1/Article consistency; missing/alias/default redirects.');
})().catch(error => { console.error(error); process.exitCode = 1; });
