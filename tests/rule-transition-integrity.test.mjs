import fs from 'node:fs';
import assert from 'node:assert/strict';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));
const transitions = JSON.parse(fs.readFileSync(new URL('../rules/transitions.json', import.meta.url), 'utf8'));

const AUTHORITATIVE_TRANSITION_HOSTS = new Set([
  'lovdata.no',
  'www.regjeringen.no'
]);

function assertAuthoritativeTransitionSource(value) {
  const url = new URL(value);
  assert.equal(url.protocol, 'https:');
  assert.ok(AUTHORITATIVE_TRANSITION_HOSTS.has(url.hostname), `unapproved legal-transition source host: ${url.hostname}`);
}

assert.ok(Array.isArray(transitions.transitions));
for (const item of transitions.transitions) {
  assert.ok(item.id);
  assert.ok(['awaiting_commencement', 'review_required', 'completed'].includes(item.status));
  assert.match(item.last_verified, /^\d{4}-\d{2}-\d{2}$/);
  assertAuthoritativeTransitionSource(item.current_source_url);
  assertAuthoritativeTransitionSource(item.new_source_url);
  assert.ok(item.expected_pending_phrase?.length >= 12);
  assert.match(item.action_when_changed ?? '', /review_required/i);
}

const inkassoTransition = transitions.transitions.find(t => t.id === 'INKASSO_2026_COMMENCEMENT');
assert.ok(inkassoTransition);
assert.match(inkassoTransition.current_source_url, /^https:\/\/lovdata\.no\//);
assert.match(inkassoTransition.new_source_url, /^https:\/\/lovdata\.no\//);
if (inkassoTransition.status === 'awaiting_commencement') {
  const inkRules = registry.rules.filter(r => r.id.startsWith('INK_'));
  assert.ok(inkRules.length > 0);
  assert.ok(inkRules.every(r => r.status === 'active'), 'Current-law INK_* rules remain active only while transition is pending');
  assert.equal(registry.rules.some(r => r.id.startsWith('INK2026_') && r.status === 'active'), false, 'New-law rules must not be activated before commencement review');
}

const fgasTransition = transitions.transitions.find(t => t.id === 'FGAS_2024_573_EEA_INCORPORATION');
assert.ok(fgasTransition);
assert.equal(new URL(fgasTransition.current_source_url).hostname, 'www.regjeringen.no');
assert.match(fgasTransition.expected_pending_phrase, /ikke innlemmet i EØS-avtalen/i);

console.log('OK legal transition integrity with explicit authoritative source allowlist');
