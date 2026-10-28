const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const root = path.resolve(__dirname, '..');

(async () => {
  let databaseCalls = 0;
  const sandbox = {
    module: { exports: {} }, console, process,
    require(name) {
      if (name === 'express') return express;
      if (name === '../middleware') return { redirectOldAirlineLinks: (_req, _res, next) => next() };
      if (name === '../models/airline') return new Proxy({}, {
        get() { databaseCalls++; throw new Error('Unexpected database access'); }
      });
      throw new Error(`Unexpected import: ${name}`);
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'routes/airlines.js'), 'utf8'), sandbox);
  const app = express();
  app.use(sandbox.module.exports);
  // Deliberate test destination: the database-backed directory is covered separately.
  app.get('/regulations/airlineList', (_req, res) => res.send('Directory destination fixture'));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(`${base}/airlines/list`, { method, redirect: 'manual' });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/regulations/airlineList');
    }
    const response = await fetch(`${base}/airlines/list`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'Directory destination fixture');
    assert.equal(databaseCalls, 0);
    console.log('PASS: real HTTP GET/HEAD legacy redirects and redirect following; no database calls.');
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
