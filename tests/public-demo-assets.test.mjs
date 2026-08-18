import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const json = p => JSON.parse(read(p));

assert.deepEqual(json('../site/rules/rules.json'), json('../rules/rules.json'), 'Public site rule registry must mirror canonical rules');
assert.deepEqual(json('../site/data/demo-cases.json'), json('../data/demo-cases.json'), 'Public site demo data must mirror canonical demos');
assert.deepEqual(json('../site/config/product.json'), json('../config/product.json'), 'Public site product config must mirror canonical product config');

assert.match(read('../site/engine/analyzer.mjs'), /\.\.\/\.\.\/engine\/analyzer\.mjs/);
assert.match(read('../site/engine/draft.mjs'), /\.\.\/\.\.\/engine\/draft\.mjs/);

const page = read('../site/index-launch-candidate.html');
for (const dependency of ['./engine/analyzer.mjs', './engine/draft.mjs', './rules/rules.json', './data/demo-cases.json', './config/product.json']) {
  assert.ok(page.includes(dependency), `Launch Candidate dependency must exist in public site mirror: ${dependency}`);
}

console.log('OK external tester demo assets are complete and synchronized');
