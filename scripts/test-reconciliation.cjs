const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');

// Optional dependency directory supports isolated checkouts before npm ci.
const load = process.env.PETVOYAGE_TEST_NODE_MODULES
  ? createRequire(path.join(process.env.PETVOYAGE_TEST_NODE_MODULES, '..', 'package.json'))
  : require;
const ejs = load('ejs');
const cheerio = load('cheerio');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const routes = [];
const router = { use() {}, get(routePath, ...handlers) { routes.push({ routePath, handlers }); } };
let databaseCalls = 0;
vm.runInNewContext(read('routes/airlines.js'), {
  module: { exports: {} }, console, process,
  require(name) {
    if (name === 'express') return { Router: () => router };
    if (name === '../models/airline') return new Proxy({}, {
      get() { databaseCalls++; throw new Error('Unexpected database access'); }
    });
    if (name === '../middleware') return { redirectOldAirlineLinks() {} };
    throw new Error(`Unexpected import: ${name}`);
  }
}, { filename: 'routes/airlines.js' });
const directoryIndex = routes.findIndex((route) => route.routePath === '/airlines/list');
const slugIndex = routes.findIndex((route) => route.routePath === '/airlines/:slug');
assert.ok(directoryIndex >= 0 && directoryIndex < slugIndex);
let redirect;
routes[directoryIndex].handlers[0]({}, { redirect: (...args) => { redirect = args; } });
assert.deepEqual(redirect, [302, '/regulations/airlineList']);
assert.equal(databaseCalls, 0);

// The flight form initiates rendering without returning a Promise. Wrapping
// that handler in catchAsync previously threw after rendering had begun.
const flightRoutes = [];
const flightRouter = {
  get(routePath, ...handlers) { flightRoutes.push({ method: 'GET', routePath, handlers }); },
  head(routePath, ...handlers) { flightRoutes.push({ method: 'HEAD', routePath, handlers }); },
  post() {}
};
vm.runInNewContext(read('routes/flights.js'), {
  module: { exports: {} }, console: { log() {} }, process: { env: {} },
  require(name) {
    if (name === 'express') return { Router: () => flightRouter };
    if (name === 'openai') return { default: class {} };
    if (name === '../utils/catchAsync') return require(path.join(root, 'utils/catchAsync'));
    if (name === '../middleware') return { saveCurrentUrl() {} };
    if (name === '../helpers/airlineUtils') return { generateAirlineNamesMap() {} };
    if (name === 'axios' || name === 'mongoose' || name.startsWith('../models/')) return {};
    throw new Error(`Unexpected flight import: ${name}`);
  }
}, { filename: 'routes/flights.js' });
let flightRenderCount = 0;
const flightGet = flightRoutes.find((route) => route.method === 'GET' && route.routePath === '/searchFlights');
assert.doesNotThrow(() => flightGet.handlers[0]({}, {
  render(view, locals) {
    flightRenderCount++;
    assert.equal(view, 'regulations/searchFlights');
    assert.ok(locals.title);
    return undefined;
  }
}, (error) => { throw error; }));
assert.equal(flightRenderCount, 1);
let headStatus;
flightRoutes.find((route) => route.method === 'HEAD' && route.routePath === '/searchFlights')
  .handlers[0]({}, { sendStatus(status) { headStatus = status; } });
assert.equal(headStatus, 200);

const navigation = cheerio.load(ejs.render(read('views/partials/navigation.ejs')));
assert.equal(navigation('a.square-icon').length, 6);
navigation('a.square-icon').each((_index, link) => assert.ok(navigation(link).attr('aria-label')?.trim()));

for (const currentUser of [null, { displayName: 'Test <script>' }]) {
  const $ = cheerio.load(ejs.render(read('views/partials/navbar.ejs'), { currentUser }));
  assert.equal($('#airlineSearch').length, 1);
  assert.ok($('#airlineSearch').attr('aria-label'));
  assert.equal($('#airlineDropdown').length, 1);
  assert.equal($('button.navbar-toggler').attr('aria-controls'), 'navbarNav');
  assert.equal($('button.navbar-toggler').attr('aria-label'), 'Toggle navigation');
  if (currentUser) {
    assert.equal($('li.nav-item.dropdown #userDropdown').length, 1);
    assert.equal($('#userDropdown').text().trim(), 'Test <script>');
    assert.equal($('#userDropdown script').length, 0);
    assert.equal($('a[href="/auth/logout"]').length, 1);
  } else {
    assert.equal($('#loginLink[href="/auth/login"]').length, 1);
  }
  assert.equal($('a[href="/flights/searchFlights"]').length, 1);
  assert.equal($('a[href="https://petsvoyage.myshopify.com/collections/all"]').length, 1);
}

const layoutSource = read('views/layouts/boilerplate.ejs');
const html = ejs.render(layoutSource, {
  req: { originalUrl: '/airlines/test?utm_source=test&page=2' },
  body: '<p>Rendered body</p>', include() { return ''; }
});
const layout = cheerio.load(html);
const bootstrap = layout('script[src*="bootstrap.bundle.min.js"]');
assert.equal(bootstrap.length, 1);
assert.equal(bootstrap.attr('integrity'), 'sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz');
assert.equal(bootstrap.attr('crossorigin'), 'anonymous');
assert.equal(layout('link[rel="canonical"]').attr('href'), 'https://www.petvoyage.ai/airlines/test?page=2');
assert.ok(layout('meta[name="robots"]').length);
assert.ok(html.includes('Rendered body'));
assert.ok(layoutSource.includes("include('../partials/jsonld'"));
console.log('PASS: legacy directory routing; mobile link names; guest/auth navbar; escaped user name; single Bootstrap bundle; canonical URL and preserved structured-data include.');

// Opt-in integration check: requires local loopback access, never a database.
if (process.argv.includes('--http')) {
  const express = load('express');
  const app = express();
  const actualRouter = express.Router();
  let actualDatabaseCalls = 0;
  vm.runInNewContext(read('routes/airlines.js'), {
    module: { exports: {} }, console, process,
    require(name) {
      if (name === 'express') return { Router: () => actualRouter };
      if (name === '../models/airline') return new Proxy({}, {
        get() { actualDatabaseCalls++; throw new Error('Unexpected database access'); }
      });
      if (name === '../middleware') return { redirectOldAirlineLinks: (_req, _res, next) => next() };
      throw new Error(`Unexpected import: ${name}`);
    }
  }, { filename: 'routes/airlines.js' });
  app.use(actualRouter);
  const server = app.listen(0, '127.0.0.1', async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/airlines/list`, {
        redirect: 'manual', signal: AbortSignal.timeout(5000)
      });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/regulations/airlineList');
      assert.equal(actualDatabaseCalls, 0);
      console.log('PASS: HTTP request through actual Express router redirects without database access.');
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    } finally {
      server.close();
      server.closeAllConnections?.();
    }
  });
  server.on('error', (error) => { console.error(error); process.exitCode = 1; });
}
