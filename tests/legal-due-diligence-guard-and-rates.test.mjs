import fs from 'node:fs';
import assert from 'node:assert/strict';
import { runCase } from '../engine/case-service.mjs';
import { resolveRegulatedSectorGuard } from '../engine/regulated-sector-guard.mjs';
import { resolveLegalRate, resolveVatRate, resolveLateInterestRate } from '../engine/legal-rates.mjs';
import { rulePackageDefinitions } from '../engine/rule-packages.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));
const dueDiligence = JSON.parse(fs.readFileSync(new URL('../rules/due-diligence-candidates.json', import.meta.url), 'utf8'));
const rates = JSON.parse(fs.readFileSync(new URL('../rules/dynamic-rates.json', import.meta.url), 'utf8'));

for (const industry of ['mobil', 'strøm', 'forsikring', 'drosje', 'persontransport']) {
  const guard = resolveRegulatedSectorGuard({ industry });
  assert.ok(guard, `regulated sector must be recognized: ${industry}`);
  assert.equal(guard.status, 'needs_clarification');
  assert.equal(guard.package_id, null);
}

const telecom = runCase({
  intake: { buyer_type: 'consumer', subject: 'service_quote', documents: ['invoice', 'quote'] },
  facts: {
    regulated_sector: 'telecom',
    invoice_total: 1499,
    agreed_price: 999,
    price_increase_after_start: true,
    customer_notified: false
  },
  registry
});
assert.equal(telecom.status, 'needs_clarification');
assert.equal(telecom.analysis, null);
assert.equal(telecom.rule_package, null);
assert.equal(telecom.draft.allowed, false);
assert.equal(telecom.legal_profile.id, 'regulated_telecom');

const ordinaryMoving = runCase({
  intake: { buyer_type: 'consumer', subject: 'service_quote', documents: ['invoice', 'quote'] },
  facts: {
    industry: 'moving',
    invoice_total: 6500,
    agreed_price: 6000,
    price_increase_after_start: true
  },
  registry
});
assert.equal(ordinaryMoving.legal_profile.id, 'moving_service');
assert.equal(ordinaryMoving.rule_package.id, 'moving_service');

assert.equal(resolveLateInterestRate(rates, { date: '2026-06-30' }).rate.value, 12.00);
assert.equal(resolveLateInterestRate(rates, { date: '2026-07-01' }).rate.value, 12.25);
assert.equal(resolveVatRate(rates, { date: '2026-08-20', category: 'general' }).rate.value, 25);
assert.equal(resolveVatRate(rates, { date: '2026-08-20', category: 'water_and_sewer_service' }).rate.value, 15);
assert.equal(resolveVatRate(rates, { date: '2026-08-20' }).status, 'needs_clarification');
assert.equal(resolveLegalRate(rates, { type: 'standard_collection_compensation_nok', date: '2026-08-20', consumer: true }).status, 'not_resolved');
assert.equal(resolveLegalRate(rates, { type: 'standard_collection_compensation_nok', date: '2026-08-20', consumer: false }).rate.value, 430);
assert.equal(resolveLateInterestRate(rates, { date: '2027-01-01' }).status, 'not_resolved');
assert.equal(resolveLateInterestRate(rates, { date: '20.08.2026' }).status, 'needs_clarification');

const runtimeIds = new Set(registry.rules.map(rule => rule.id));
const packageIds = new Set(Object.values(rulePackageDefinitions()).flatMap(pkg => pkg.allowed_rule_ids ?? []));
for (const rule of dueDiligence.rules) {
  assert.equal(dueDiligence.runtime, false);
  assert.equal(rule.status, 'preactivation_candidate');
  assert.equal(runtimeIds.has(rule.id), false, `${rule.id} must not exist in runtime registry`);
  assert.equal(packageIds.has(rule.id), false, `${rule.id} must not exist in runtime package`);
}

console.log('OK: regulated sectors fail closed, ordinary supported services continue, and legal rates resolve strictly by effective date.');
