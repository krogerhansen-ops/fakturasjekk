import fs from 'node:fs';
import assert from 'node:assert/strict';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));

assert.equal(registry.jurisdiction, 'NO');
assert.equal(registry.audience, 'consumer');
assert.ok(Array.isArray(registry.rules) && registry.rules.length >= 7);

const ids = new Set();
for (const rule of registry.rules) {
  assert.ok(rule.id, 'rule must have id');
  assert.ok(!ids.has(rule.id), `duplicate rule id: ${rule.id}`);
  ids.add(rule.id);
  assert.match(rule.source_url, /^https:\/\/lovdata\.no\//, `${rule.id}: source must be Lovdata`);
  assert.ok(rule.section, `${rule.id}: section missing`);
  assert.ok(rule.expected_phrase?.length >= 12, `${rule.id}: expected phrase too short`);
  assert.ok(['active', 'review_required', 'disabled'].includes(rule.status), `${rule.id}: invalid status`);
  assert.match(rule.last_verified, /^\d{4}-\d{2}-\d{2}$/, `${rule.id}: last_verified must be YYYY-MM-DD`);
}

const scenarios = [
  {
    name: 'Elektriker – prisoverslag',
    agreed: 120000,
    invoiced: 146000,
    expectedDiff: 26000,
    requiredRules: ['HTJL_32_PRICE_ESTIMATE', 'HTJL_33_SURCHARGE', 'HTJL_36_INVOICE']
  },
  {
    name: 'Flyttebyrå – pristilbud',
    agreed: 18000,
    invoiced: 27600,
    expectedDiff: 9600,
    requiredRules: ['POF_10_SERVICE_PRICES', 'POF_12_QUOTE', 'BOF_5_1_1_SALES_DOC']
  },
  {
    name: 'Elektronikk – dobbeltføring + gebyr',
    agreed: 25480,
    invoiced: 28069,
    expectedDiff: 2589,
    requiredRules: ['FKJL_37_PRICE_AND_FEE']
  },
  {
    name: 'Ingen avvik',
    agreed: 3490,
    invoiced: 3490,
    expectedDiff: 0,
    requiredRules: []
  }
];

for (const scenario of scenarios) {
  assert.equal(scenario.invoiced - scenario.agreed, scenario.expectedDiff, `${scenario.name}: amount mismatch`);
  for (const ruleId of scenario.requiredRules) {
    assert.ok(ids.has(ruleId), `${scenario.name}: missing rule ${ruleId}`);
    const rule = registry.rules.find(r => r.id === ruleId);
    assert.equal(rule.status, 'active', `${scenario.name}: ${ruleId} is not active`);
  }
}

const estimate = 120000;
const fifteenPercentCeiling = Math.round(estimate * 1.15);
assert.equal(fifteenPercentCeiling, 138000, '15 % demo ceiling changed unexpectedly');
assert.ok(146000 > fifteenPercentCeiling, 'electrician demo should exceed the 15 % control level before surcharge assessment');

console.log(`OK: ${registry.rules.length} rules and ${scenarios.length} regression scenarios validated.`);
