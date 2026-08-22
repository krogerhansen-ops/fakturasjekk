import fs from 'node:fs';
import assert from 'node:assert/strict';
import { rulePackageDefinitions, collectionRuleIds } from '../engine/rule-packages.mjs';
import { discoverPreactivationRegistries } from '../scripts/legal-candidate-discovery.mjs';

const runtime = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));
const candidates = JSON.parse(fs.readFileSync(new URL('../rules/consumer-payment-candidates.json', import.meta.url), 'utf8'));
const rulesDir = new URL('../rules/', import.meta.url);

assert.equal(candidates.runtime, false);
assert.equal(candidates.purpose, 'preactivation_only');
assert.equal(candidates.jurisdiction, 'NO');
assert.equal(candidates.last_reviewed, '2026-08-22');
assert.equal(candidates.rules.length, 6);

const expected = [
  'FIN_2_4_INVOICE_FEE_ACTUAL_COST',
  'HTJL_37_PAYMENT_AFTER_ITEMIZED_INVOICE',
  'FKJL_38_PAYMENT_TIMING',
  'FKJL_41_CANCELLATION_BEFORE_DELIVERY',
  'ANGRL_23_WITHDRAWAL_EFFECT',
  'ANGRL_24_REFUND'
];
assert.deepEqual(candidates.rules.map(rule => rule.id), expected);

const runtimeIds = new Set(runtime.rules.map(rule => rule.id));
const packageIds = new Set([
  ...Object.values(rulePackageDefinitions()).flatMap(def => def.allowed_rule_ids ?? []),
  ...collectionRuleIds()
]);

for (const rule of candidates.rules) {
  assert.equal(rule.status, 'preactivation_candidate');
  assert.match(rule.source_url, /^https:\/\/lovdata\.no\//);
  assert.ok(rule.expected_phrase.length >= 12);
  assert.match(rule.last_verified, /^2026-08-22$/);
  assert.ok(Array.isArray(rule.conditions) && rule.conditions.length >= 2);
  assert.match(rule.notes, /ikke runtime-aktiv/i);
  assert.equal(runtimeIds.has(rule.id), false, `${rule.id} must not exist in runtime registry`);
  assert.equal(packageIds.has(rule.id), false, `${rule.id} must not exist in a runtime package`);
}

const finance = candidates.rules.find(rule => rule.id === 'FIN_2_4_INVOICE_FEE_ACTUAL_COST');
assert.match(finance.conditions.join(' '), /ikke gjette|skal ikke gjette/i);
const htjl37 = candidates.rules.find(rule => rule.id === 'HTJL_37_PAYMENT_AFTER_ITEMIZED_INVOICE');
assert.match(htjl37.conditions.join(' '), /ikke oppfinne en fast daggrense/i);
const cancellation = candidates.rules.find(rule => rule.id === 'FKJL_41_CANCELLATION_BEFORE_DELIVERY');
assert.match(cancellation.conditions.join(' '), /skal ikke anta at avbestilling er kostnadsfri/i);
const withdrawal = candidates.rules.find(rule => rule.id === 'ANGRL_23_WITHDRAWAL_EFFECT');
assert.match(withdrawal.notes, /aldri aktiveres bare fordi brukeren/i);

const discovered = discoverPreactivationRegistries(new URL('../rules/', import.meta.url).pathname);
assert.ok(discovered.registries.some(item => item.name === 'consumer-payment-candidates.json'));
for (const id of expected) assert.ok(discovered.rules.some(rule => rule.id === id && rule.registry_file === 'consumer-payment-candidates.json'));

const sourceWatch = fs.readFileSync(new URL('../scripts/legal-source-check.mjs', import.meta.url), 'utf8');
assert.match(sourceWatch, /discoverPreactivationRegistries/);
assert.equal(sourceWatch.includes('consumer-payment-candidates.json'), false, 'new candidate registries must be monitored by discovery, not hard-coded filenames');

console.log('OK six consumer payment candidates are source-monitorable, fail-closed and isolated from every runtime rule package.');
