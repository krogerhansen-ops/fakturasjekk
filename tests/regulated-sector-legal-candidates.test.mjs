import fs from 'node:fs';
import assert from 'node:assert/strict';
import { rulePackageDefinitions, collectionRuleIds } from '../engine/rule-packages.mjs';

const candidates = JSON.parse(fs.readFileSync(new URL('../rules/regulated-sector-candidates.json', import.meta.url), 'utf8'));
const runtime = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));
const transitions = JSON.parse(fs.readFileSync(new URL('../rules/transitions.json', import.meta.url), 'utf8'));

assert.equal(candidates.runtime, false);
assert.equal(candidates.purpose, 'preactivation_only');
assert.equal(candidates.jurisdiction, 'NO');
assert.equal(candidates.rules.length, 10);

const runtimeIds = new Set(runtime.rules.map(rule => rule.id));
const packageIds = new Set([
  ...Object.values(rulePackageDefinitions()).flatMap(def => def.allowed_rule_ids ?? []),
  ...collectionRuleIds()
]);

const expectedIds = new Set([
  'EKOM_4_11_NONPAYMENT_GUARD',
  'INSURANCE_5_1_PREMIUM_GUARD',
  'ENERGY_7_2_INVOICE_GUARD',
  'TAXI_25D_PRICE_QUOTE_GUARD',
  'DIGITAL_28_PRICE_GUARD',
  'PARKING_36_SANCTION_GUARD',
  'PACKAGE_TRAVEL_9_TOTAL_PRICE_GUARD',
  'HOUSING_RENT_3_1_RENT_GUARD',
  'DENTAL_18_QUOTE_GUARD',
  'FUNERAL_17_QUOTE_GUARD'
]);

for (const rule of candidates.rules) {
  assert.ok(expectedIds.delete(rule.id), `unexpected or duplicate candidate ${rule.id}`);
  assert.equal(rule.status, 'preactivation_candidate');
  assert.match(rule.last_verified, /^2026-08-22$/);
  assert.ok(Array.isArray(rule.conditions) && rule.conditions.length >= 2);
  assert.match(rule.notes ?? '', /ikke runtime-aktiv/i);
  assert.equal(runtimeIds.has(rule.id), false, `${rule.id} leaked into runtime registry`);
  assert.equal(packageIds.has(rule.id), false, `${rule.id} leaked into runtime package`);
}
assert.equal(expectedIds.size, 0, `missing candidates: ${[...expectedIds].join(', ')}`);

const fgas = transitions.transitions.find(item => item.id === 'FGAS_2024_573_EEA_INCORPORATION');
assert.ok(fgas, 'f-gas transition watch missing');
assert.equal(fgas.status, 'awaiting_commencement');
assert.match(fgas.current_source_url, /^https:\/\/www\.regjeringen\.no\//);
assert.match(fgas.expected_pending_phrase, /ikke innlemmet i EØS-avtalen/);
assert.match(fgas.action_when_changed, /manual review/i);

console.log('OK regulated-sector legal anchors remain non-runtime and f-gas transition is fail-closed.');
