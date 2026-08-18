import assert from 'node:assert/strict';
import { createFactConfirmationHandlers } from '../server/fact-confirmation-handlers.mjs';

let calls = 0;
const services = {
  async confirmFacts({ case_id, owner_id, items }) {
    calls += 1;
    assert.equal(case_id, 'case-1');
    assert.equal(owner_id, 'u1');
    assert.equal(items[0].confirmed_by_user, true);
    return {
      confirmed: true,
      confirmed_fields: ['invoice_total'],
      remaining_needs: [],
      case: { id: 'case-1', owner_id: 'u1', state: 'draft', retention_mode: 'temporary', documents: [], analyses: [], payments: [], drafts: [], supplier_responses: [], follow_ups: [], fact_confirmations: { invoice_total: { value: 1000 } } }
    };
  }
};
const handlers = createFactConfirmationHandlers({ services });
const result = await handlers.confirm_facts({
  auth: { user: { id: 'u1' } }, params: { case_id: 'case-1' },
  body: { items: [{ field: 'invoice_total', value: 1000, source_document_id: 'doc-1', source_page: 1, confirmed_by_user: true }] }
});
assert.equal(result.status, 200);
assert.equal(result.body.confirmed, true);
assert.deepEqual(result.body.confirmed_fields, ['invoice_total']);
assert.equal('owner_id' in result.body.case, false);
assert.equal(JSON.stringify(result.body).includes('fact_confirmations'), false);
assert.equal(calls, 1);

await assert.rejects(
  () => handlers.confirm_facts({ auth: { user: { id: 'u1' } }, params: { case_id: 'case-1' }, body: { items: [] } }),
  error => error?.code === 'fact_confirmations_required'
);
console.log('OK public fact confirmation handler');
