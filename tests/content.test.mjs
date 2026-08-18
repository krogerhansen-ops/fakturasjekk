import fs from 'node:fs';
import assert from 'node:assert/strict';

const product = JSON.parse(fs.readFileSync(new URL('../config/product.json', import.meta.url), 'utf8'));
const publicPage = fs.readFileSync(new URL('../site/index-launch-candidate.html', import.meta.url), 'utf8').toLowerCase();
const rootIndex = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').toLowerCase();
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8').toLowerCase();

assert.equal(product.price_nok, 29, 'customer price must remain 29 NOK unless intentionally changed');
assert.equal(product.full_check_free, false, 'full check must not be marked free');
assert.equal(product.demo_free, true, 'demo should remain free');
assert.equal(product.includes.includes('objection_draft'), true, '29 NOK package must include objection draft');

for (const content of [publicPage, readme]) {
  assert.ok(content.includes('29 kr'), 'public customer content must state the 29 kr price');
}

assert.ok(rootIndex.includes('site/index-launch-candidate.html'), 'root index must redirect to the public launch candidate');

const forbidden = [
  'fakturasjekk er gratis',
  'full fakturasjekk er gratis',
  'gratis full fakturasjekk',
  'gratis full sjekk'
];

for (const phrase of forbidden) {
  assert.equal(publicPage.includes(phrase), false, `public launch page contains forbidden pricing phrase: ${phrase}`);
  assert.equal(readme.includes(phrase), false, `README contains forbidden pricing phrase: ${phrase}`);
}

console.log('OK: product price and public messaging are consistent: demo free, full check + objection draft 29 NOK.');
