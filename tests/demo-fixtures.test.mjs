import fs from 'node:fs';
import assert from 'node:assert/strict';
import { analyzeCase } from '../engine/analyzer.mjs';
import { buildDraft } from '../engine/draft.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));
const demos = JSON.parse(fs.readFileSync(new URL('../data/demo-cases.json', import.meta.url), 'utf8'));
const publicDemos = JSON.parse(fs.readFileSync(new URL('../site/data/demo-cases.json', import.meta.url), 'utf8'));

assert.equal(demos.length, 5, 'public demo should contain five cases including vehicle repair');
assert.deepEqual(publicDemos, demos, 'public demo fixture mirror must stay identical to canonical demo data');

const expected = {
  electrician: { diff: 26000, status: 'attention', draft: true },
  'vehicle-repair': {
    diff: 10300,
    status: 'attention',
    draft: true,
    rules: [
      'HTJL_7_DUTY_TO_ADVISE',
      'HTJL_9_ADDITIONAL_WORK',
      'HTJL_32_PRICE_ESTIMATE',
      'HTJL_33_SURCHARGE',
      'HTJL_34_PRELIMINARY_EXAMINATION'
    ]
  },
  moving: { diff: 9600, status: 'attention', draft: true },
  electronics: { diff: 2589, status: 'attention', draft: true },
  clean: { diff: 0, status: 'clean', draft: false }
};

const statusByRule = new Map(registry.rules.map(rule => [rule.id, rule.status]));

for (const demo of demos) {
  assert.ok(expected[demo.id], `unexpected demo id ${demo.id}`);
  const analysis = analyzeCase(demo.input, registry);
  assert.equal(analysis.calculations.difference, expected[demo.id].diff, `${demo.id}: wrong difference`);
  assert.equal(analysis.status, expected[demo.id].status, `${demo.id}: wrong status`);

  for (const id of analysis.rule_ids ?? []) {
    assert.equal(statusByRule.get(id), 'active', `${demo.id}: demo returned non-active rule ${id}`);
  }
  for (const id of expected[demo.id].rules ?? []) {
    assert.ok(analysis.rule_ids.includes(id), `${demo.id}: expected rule ${id}`);
  }

  const draft = buildDraft({ analysis, registry, mode: 'request' });
  assert.equal(draft.allowed, expected[demo.id].draft, `${demo.id}: draft allowed mismatch`);
  if (draft.allowed) {
    assert.equal(/HTJL_|FKJL_|MFL_|POF_|BOF_|INK_/.test(draft.text), false, `${demo.id}: internal rule id leaked`);
  }
}

const vehicle = demos.find(demo => demo.id === 'vehicle-repair');
assert.ok(vehicle, 'vehicle repair demo missing');
assert.equal(vehicle.input.industry, 'vehicle_repair');
assert.equal(vehicle.input.invoice_total, vehicle.input.lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0), 'vehicle repair line sum must equal invoice total');
assert.equal(statusByRule.get('HTJL_8_FAILURE_TO_ADVISE'), 'candidate');
assert.equal(statusByRule.get('POF_10_SERVICE_PRICES'), 'candidate');

console.log('OK: all five public demos, including high-difficulty vehicle repair, are consistent with the deterministic engine and controlled draft generator.');
