import fs from 'node:fs';
import assert from 'node:assert/strict';
import { rulePackageDefinitions, collectionRuleIds } from '../engine/rule-packages.mjs';

const runtime = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));
const specialist = JSON.parse(fs.readFileSync(new URL('../rules/specialist-candidates.json', import.meta.url), 'utf8'));

assert.equal(specialist.runtime, false, 'specialist registry must never be a runtime source');
assert.equal(specialist.purpose, 'preactivation_only');
assert.equal(specialist.jurisdiction, 'NO');
assert.ok(Array.isArray(specialist.rules) && specialist.rules.length >= 10);

const runtimeIds = new Set(runtime.rules.map(rule => rule.id));
const packageIds = new Set([
  ...Object.values(rulePackageDefinitions()).flatMap(def => def.allowed_rule_ids ?? []),
  ...collectionRuleIds()
]);
const specialistIds = new Set();

for (const rule of specialist.rules) {
  assert.ok(rule.id && !specialistIds.has(rule.id), `duplicate specialist id ${rule.id}`);
  specialistIds.add(rule.id);
  assert.equal(rule.status, 'preactivation_candidate', `${rule.id} must not be runtime-active`);
  assert.match(rule.source_url, /^https:\/\/lovdata\.no\//, `${rule.id} must use Lovdata as legal source`);
  assert.ok(rule.expected_phrase?.length >= 12, `${rule.id}: expected phrase too short`);
  assert.match(rule.last_verified, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Array.isArray(rule.conditions) && rule.conditions.length > 0, `${rule.id}: activation conditions missing`);
  assert.match(rule.notes ?? '', /ikke runtime-aktiv|ikke runtime|ikke.*aktiv/i, `${rule.id}: notes must state non-runtime status`);
  assert.equal(runtimeIds.has(rule.id), false, `${rule.id}: preactivation rule leaked into runtime registry`);
  assert.equal(packageIds.has(rule.id), false, `${rule.id}: preactivation rule leaked into a runtime rule package`);
}

const required = [
  'HTJL_2_PURCHASE_BOUNDARY',
  'VEHICLE_WORKSHOP_3_APPROVAL',
  'VEHICLE_WORKSHOP_14A_COLLISION_DOCUMENTATION',
  'PKK_2_APPROVED_CONTROL_BODY',
  'FKJL_30_REMEDY_INVESTIGATION_COST',
  'FEK_3_ELECTRICAL_REGISTER',
  'FEL_12_CONFORMITY_DOCUMENTATION',
  'CLEANING_17_PROVIDER_STATUS',
  'TEK17_15_5_WATER_INSTALLATION',
  'TEK17_15_6_DRAINAGE_INSTALLATION',
  'PRODUCT_6A_3_FGAS_CERTIFICATION',
  'FIN_5_10_CREDIT_FEES',
  'BUOFL_1_NEW_HOME_SCOPE'
];
for (const id of required) assert.ok(specialistIds.has(id), `missing audited preactivation rule ${id}`);

const sourceCheck = fs.readFileSync(new URL('../scripts/legal-source-check.mjs', import.meta.url), 'utf8');
assert.match(sourceCheck, /specialist-candidates\.json/);
assert.match(sourceCheck, /preactivation_candidate/);
assert.match(sourceCheck, /runtime !== false/);

console.log(`OK ${specialist.rules.length} specialist legal candidates are source-monitored but isolated from every runtime rule package.`);
