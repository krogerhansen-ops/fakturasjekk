import fs from 'node:fs';
import assert from 'node:assert/strict';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));
const transitions = JSON.parse(fs.readFileSync(new URL('../rules/transitions.json', import.meta.url), 'utf8'));
const OFFICIAL_TRANSITION_SOURCE = /^https:\/\/(?:lovdata\.no|www\.regjeringen\.no)\//;

assert.ok(Array.isArray(transitions.transitions));
for (const item of transitions.transitions) {
  assert.ok(item.id);
  assert.ok(['awaiting_commencement', 'review_required', 'completed'].includes(item.status));
  assert.match(item.last_verified, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(item.current_source_url, OFFICIAL_TRANSITION_SOURCE, `${item.id}: current transition source must be Lovdata or Regjeringen`);
  assert.match(item.new_source_url, OFFICIAL_TRANSITION_SOURCE, `${item.id}: new transition source must be Lovdata or Regjeringen`);
  assert.ok(item.expected_pending_phrase?.length >= 12);
  assert.match(item.action_when_changed ?? '', /review_required/i);
}

const inkassoTransition = transitions.transitions.find(t => t.id === 'INKASSO_2026_COMMENCEMENT');
assert.ok(inkassoTransition);
if (inkassoTransition.status === 'awaiting_commencement') {
  const inkRules = registry.rules.filter(r => r.id.startsWith('INK_'));
  assert.ok(inkRules.length > 0);
  assert.ok(inkRules.every(r => r.status === 'active'), 'Current-law INK_* rules remain active only while transition is pending');
  assert.equal(registry.rules.some(r => r.id.startsWith('INK2026_') && r.status === 'active'), false, 'New-law rules must not be activated before commencement review');
}

const fgasTransition = transitions.transitions.find(t => t.id === 'FGAS_2024_573_EEA_INCORPORATION');
assert.ok(fgasTransition);
assert.equal(fgasTransition.status, 'awaiting_commencement');
assert.match(fgasTransition.current_source_url, /^https:\/\/www\.regjeringen\.no\//);
assert.match(fgasTransition.action_when_changed, /heat-pump.*review_required/i);

console.log('OK legal transition integrity uses a closed official-source allowlist and fail-closed review actions');
