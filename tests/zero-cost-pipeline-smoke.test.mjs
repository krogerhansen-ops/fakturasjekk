import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyzeCase } from '../engine/analyzer.mjs';
import { buildDraft } from '../engine/draft.mjs';

const demos = JSON.parse(fs.readFileSync(new URL('../data/demo-cases.json', import.meta.url), 'utf8'));
const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));

assert.equal(Array.isArray(demos), true);
assert.equal(demos.length >= 5, true);
assert.equal((registry.rules ?? []).some(rule => rule.status === 'active'), true);

for (const demo of demos) {
  const analysis = analyzeCase(demo.input, registry);
  assert.equal(analysis.supported, true, `${demo.id}: demo must remain supported`);
  assert.equal(Array.isArray(analysis.findings), true, `${demo.id}: findings must be an array`);
  assert.equal(Array.isArray(analysis.rule_ids), true, `${demo.id}: rule_ids must be an array`);

  const draft = buildDraft({
    analysis,
    registry,
    invoice_reference: `DEMO-${demo.id}`,
    user_note: '',
    mode: 'request'
  });

  if (demo.id === 'clean') {
    assert.equal(draft.allowed, false, 'clean demo must not generate an objection/request draft');
    continue;
  }

  assert.equal(analysis.findings.length > 0, true, `${demo.id}: expected at least one finding`);
  if (draft.allowed) {
    assert.equal(typeof draft.text, 'string');
    assert.equal(draft.text.includes(`DEMO-${demo.id}`), true);
    assert.equal(/\b(?:HTJL|FKJL|MFL|POF|BOF|INK)_[A-Z0-9_]+\b/.test(draft.text), false, `${demo.id}: internal rule id leaked`);
    assert.equal(draft.text.includes('jf.'), true, `${demo.id}: controlled legal reference expected in draft`);
  }
}

console.log(`zero-cost-pipeline-smoke.test.mjs passed (${demos.length} synthetic cases)`);
