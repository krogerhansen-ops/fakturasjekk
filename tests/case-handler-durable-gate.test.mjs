import assert from 'node:assert/strict';
import { createCaseHandlers } from '../server/case-handlers.mjs';

const request = { auth: { user: { id: 'u1' } }, params: { case_id: 'case-1' }, body: {} };

{
  let fullCalled = false;
  const handlers = createCaseHandlers({
    services: {
      async getFullResult() { fullCalled = true; return { status: 'clean', analysis: { rule_ids: [], findings: [], questions: [] }, evidence: [] }; }
    },
    serviceDeliveryGate: {
      async assertReady() {
        const error = new Error('durable missing');
        error.code = 'durable_confirmation_required';
        throw error;
      }
    }
  });
  await assert.rejects(() => handlers.full_result(request), error => error?.code === 'durable_confirmation_required');
  assert.equal(fullCalled, false);
}

{
  let draftCalled = false;
  const handlers = createCaseHandlers({
    services: {
      async saveGeneratedDraft() {
        draftCalled = true;
        return { draft: { id: 'draft-1', mode: 'request', text: 'x' }, case: { id: 'case-1', documents: [], analyses: [], payments: [], drafts: [] } };
      }
    },
    serviceDeliveryGate: {
      async assertReady() {
        const error = new Error('durable missing');
        error.code = 'durable_confirmation_required';
        throw error;
      }
    }
  });
  await assert.rejects(() => handlers.create_draft(request), error => error?.code === 'durable_confirmation_required');
  assert.equal(draftCalled, false);
}

{
  let gateCalls = 0;
  let fullCalled = false;
  const handlers = createCaseHandlers({
    services: {
      async getFullResult() {
        fullCalled = true;
        return {
          status: 'clean',
          engine: 'test',
          analysis: { rule_ids: [], calculations: {}, findings: [], questions: [] },
          evidence: [], evidence_summary: {}, assurance: null, draft: { allowed: false, reason: 'Ingen avvik.' }
        };
      }
    },
    serviceDeliveryGate: { async assertReady() { gateCalls += 1; return { ready: true }; } }
  });
  const response = await handlers.full_result(request);
  assert.equal(response.status, 200);
  assert.equal(gateCalls, 1);
  assert.equal(fullCalled, true);
}

console.log('OK full result and draft endpoints call durable-delivery gate before paid service content leaves the server.');
