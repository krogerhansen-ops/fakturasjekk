import fs from 'node:fs';
import assert from 'node:assert/strict';
import { computeRetention, purgePlan, switchRetentionMode } from '../engine/retention.mjs';

const policy = JSON.parse(fs.readFileSync(new URL('../config/retention-policy.json', import.meta.url), 'utf8'));

const temporary = {
  id: 'case-1',
  retention_mode: 'temporary',
  created_at: '2026-08-18T10:00:00.000Z',
  updated_at: '2026-08-18T12:00:00.000Z',
  documents: [{ id: 'doc-1' }],
  analyses: [{ id: 'a1', created_at: '2026-08-18T12:00:00.000Z' }],
  drafts: [], supplier_responses: [], follow_ups: [], events: []
};

const before = computeRetention(temporary, policy, { now: '2026-08-19T11:59:00.000Z' });
assert.equal(before.source_documents_expired, false);
assert.equal(before.case_content_expired, false);

const afterDocs = purgePlan(temporary, policy, { now: '2026-08-19T12:01:00.000Z' });
assert.equal(afterDocs.retention.source_documents_expired, true);
assert.ok(afterDocs.actions.some(a => a.type === 'DELETE_SOURCE_DOCUMENTS'));
assert.equal(afterDocs.actions.some(a => a.type === 'DELETE_CASE_CONTENT'), false);

const afterCase = purgePlan(temporary, policy, { now: '2026-08-25T12:01:00.000Z' });
assert.equal(afterCase.retention.case_content_expired, true);
assert.ok(afterCase.actions.some(a => a.type === 'DELETE_CASE_CONTENT'));

const saved = switchRetentionMode(temporary, 'saved_case', policy, { clock: () => '2026-08-18T13:00:00.000Z' });
assert.equal(saved.retention_mode, 'saved_case');
assert.equal(saved.events.at(-1).data.explicit_user_choice, true);
const savedRetention = computeRetention(saved, policy, { now: '2026-11-15T12:59:59.000Z' });
assert.equal(savedRetention.case_content_expired, false);
assert.equal(savedRetention.requires_user_action_to_extend, true);
const savedExpired = computeRetention(saved, policy, { now: '2026-11-16T13:00:01.000Z' });
assert.equal(savedExpired.case_content_expired, true);

assert.equal(policy.modes.temporary.default, true);
assert.equal(policy.modes.saved_case.requires_explicit_user_choice, true);
assert.equal(policy.purge_behavior.separate_payment_accounting_records_from_case_documents, true);

console.log('OK: privacy-by-default retention uses short temporary storage and explicit opt-in for saved cases, with deterministic purge dates.');
