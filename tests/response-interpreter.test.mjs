import assert from 'node:assert/strict';
import { validateResponseInterpretation, createValidatedResponseInterpreter } from '../server/response-interpreter-contract.mjs';
import { createSupplierResponseHandlers } from '../server/supplier-response-handlers.mjs';

const original = [{ code: 'FINDING_A', title: 'Prisavvik', explanation: 'Forklar tillegg.' }];
const good = validateResponseInterpretation({ items: [{ finding_code: 'FINDING_A', coverage: 'partial', answer_text: 'Vi undersøker dette.', documentation_required: true, documentation_provided: false }] }, original);
assert.equal(good.valid, true);

const bad = validateResponseInterpretation({ items: [{ finding_code: 'INVENTED_FINDING', coverage: 'answered', answer_text: 'nope' }] }, original);
assert.equal(bad.valid, false);
assert.match(bad.errors[0], /ukjent/i);

const wrapped = createValidatedResponseInterpreter({ provider: { async interpret() { return { items: [{ finding_code: 'INVENTED_FINDING', coverage: 'answered' }] }; } } });
await assert.rejects(() => wrapped.interpret({ original_findings: original, response_text: 'Svar' }), /contract failed/i);

let calls = 0;
const handlers = createSupplierResponseHandlers({ supplierResponseService: { async processText() { calls += 1; return { review: { allowed: true, items: [] }, follow_up: { allowed: false }, case: { id: 'case-1', state: 'supplier_response_received', documents: [], analyses: [], payments: [], drafts: [], supplier_responses: [], follow_ups: [] } }; } } });
const injected = await assert.rejects(
  () => handlers.supplier_response({ auth: { user: { id: 'u1' } }, params: { case_id: 'case-1' }, body: { response_text: 'Hei', structured_response: { items: [] } } }),
  error => error?.code === 'internal_fields_not_allowed'
);
assert.equal(injected, undefined);
assert.equal(calls, 0);

console.log('OK supplier response interpreter boundary');
