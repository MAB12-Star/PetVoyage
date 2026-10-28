import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAllowedUrl } from '../utils/regs-agent/policy.mjs';

const require = createRequire(import.meta.url);
const ejs = require('ejs');

// Representative hosts added by the newer policy must survive reconciliation.
for (const hostname of [
  'mast.is', 'www.mast.is', 'island.is', 'www.island.is',
  'stjornarradid.is', 'agriculture.gov.au', 'favv-afsca.be',
  'ruokavirasto.fi', 'nvwa.nl', 'mpi.govt.nz',
]) {
  assert.equal(isAllowedUrl(`https://${hostname}/`), true, hostname);
}
assert.equal(isAllowedUrl('https://unrelated.is/'), false);
assert.equal(isAllowedUrl('not a URL'), false);

// This documents inherited fallback behavior, NOT official-source verification.
assert.equal(isAllowedUrl('https://mast.gov/'), true);
const decisions = await readFile(new URL('../operations/CONTENT-RECONCILIATION.md', import.meta.url), 'utf8');
assert.match(decisions, /mast\.gov/);
assert.match(decisions, /not been verified/);
assert.match(decisions, /broad.*fallback/);

const templateUrl = new URL('../views/regulations/showAirline.ejs', import.meta.url);
const template = await readFile(templateUrl, 'utf8');
ejs.compile(template, { filename: templateUrl.pathname });
const start = template.indexOf('<% if (airline.petPolicyURL?.trim())');
assert.notEqual(start, -1, 'Policy-link conditional must exist');
const end = template.indexOf('</div>', start);
assert.notEqual(end, -1, 'Policy-link container must close');
const fragment = template.slice(start, end);
for (const petPolicyURL of [undefined, '', '   ', 'https://example.com/pets']) {
  const output = ejs.render(fragment, { airline: { petPolicyURL } });
  const hasLink = Boolean(petPolicyURL?.trim());
  assert.equal(output.includes('href='), hasLink);
  assert.equal(output.includes('Airline policy link unavailable.'), !hasLink);
}

console.log('Content reconciliation checks passed: expanded hosts, Iceland rejection, documented broad .gov fallback, full template compilation, and four policy-link states.');
