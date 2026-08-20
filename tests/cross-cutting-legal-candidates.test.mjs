import fs from 'node:fs';
import assert from 'node:assert/strict';
import { rulePackageDefinitions, collectionRuleIds } from '../engine/rule-packages.mjs';

const runtime = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));
const crossCutting = JSON.parse(fs.readFileSync(new URL('../rules/cross-cutting-candidates.json', import.meta.url), 'utf8'));
const transitions = JSON.parse(fs.readFileSync(new URL('../rules/transitions.json', import.meta.url), 'utf8'));

assert.equal(crossCutting.runtime, false);
assert.equal(crossCutting.purpose, 'preactivation_only');
assert.equal(crossCutting.jurisdiction, 'NO');

const runtimeIds = new Set(runtime.rules.map(rule => rule.id));
const packageIds = new Set([
  ...Object.values(rulePackageDefinitions()).flatMap(def => def.allowed_rule_ids ?? []),
  ...collectionRuleIds()
]);
const ids = new Set();
for (const rule of crossCutting.rules ?? []) {
  assert.ok(rule.id && !ids.has(rule.id), `duplicate cross-cutting id ${rule.id}`);
  ids.add(rule.id);
  assert.equal(rule.status, 'preactivation_candidate');
  assert.match(rule.source_url, /^https:\/\/lovdata\.no\//);
  assert.ok(Array.isArray(rule.conditions) && rule.conditions.length >= 2);
  assert.equal(runtimeIds.has(rule.id), false, `${rule.id}: leaked into runtime registry`);
  assert.equal(packageIds.has(rule.id), false, `${rule.id}: leaked into runtime rule package`);
}

for (const required of [
  'MVAL_15_11_VAT_IN_SALES_DOCUMENT',
  'HTJL_37_ITEMIZED_INVOICE_PAYMENT_TIME',
  'FIN_2_4_INVOICE_PAYMENT_FEE_COST_CAP',
  'TEK17_15_4_HEAT_PUMP'
]) assert.ok(ids.has(required), `missing cross-cutting due-diligence rule ${required}`);

const fgasTransition = (transitions.transitions ?? []).find(item => item.id === 'FGAS_EU_2024_573_EEA_INCORPORATION');
assert.ok(fgasTransition, 'f-gas EEA transition must be source-watched');
assert.equal(fgasTransition.status, 'awaiting_commencement');
assert.match(fgasTransition.expected_pending_phrase, /ikke innlemmet i EØS-avtalen/i);
assert.match(fgasTransition.action_when_changed, /manual review/i);

const sourceCheck = fs.readFileSync(new URL('../scripts/legal-source-check.mjs', import.meta.url), 'utf8');
assert.match(sourceCheck, /cross-cutting-candidates\.json/);
assert.match(sourceCheck, /preactivationRegistries/);

console.log(`OK ${crossCutting.rules.length} cross-cutting legal candidates are source-monitored and cannot leak into runtime.`);
