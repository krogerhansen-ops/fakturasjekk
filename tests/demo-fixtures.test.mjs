import fs from 'node:fs';
import assert from 'node:assert/strict';
import { analyzeCase } from '../engine/analyzer.mjs';
import { buildDraft } from '../engine/draft.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));
const demos = JSON.parse(fs.readFileSync(new URL('../data/demo-cases.json', import.meta.url), 'utf8'));

assert.equal(demos.length, 4, 'public demo should contain four cases');

const expected = {
  electrician: { diff: 26000, status: 'attention', draft: true },
  moving: { diff: 9600, status: 'attention', draft: true },
  electronics: { diff: 2589, status: 'attention', draft: true },
  clean: { diff: 0, status: 'clean', draft: false }
};

for (const demo of demos) {
  assert.ok(expected[demo.id], `unexpected demo id ${demo.id}`);
  const analysis = analyzeCase(demo.input, registry);
  assert.equal(analysis.calculations.difference, expected[demo.id].diff, `${demo.id}: wrong difference`);
  assert.equal(analysis.status, expected[demo.id].status, `${demo.id}: wrong status`);
  const draft = buildDraft({ analysis, registry, mode: 'request' });
  assert.equal(draft.allowed, expected[demo.id].draft, `${demo.id}: draft allowed mismatch`);
  if (draft.allowed) assert.equal(/HTJL_|FKJL_|POF_|BOF_/.test(draft.text), false, `${demo.id}: internal rule id leaked`);
}

console.log('OK: all four public demos are consistent with the deterministic engine and controlled draft generator.');
