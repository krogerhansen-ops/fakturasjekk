import assert from 'node:assert/strict';
import {
  createCase,
  transitionCase,
  addDocument,
  addAnalysis,
  addPayment,
  addDraft,
  addSupplierResponse,
  addFollowUp,
  publicCaseSummary
} from '../engine/case-state.mjs';

let tick = 0;
const clock = () => `2026-08-18T13:${String(tick++).padStart(2, '0')}:00.000Z`;

let c = createCase({ id: 'case-1', owner_id: 'user-1', retention_mode: 'temporary', clock });
assert.equal(c.state, 'draft');
assert.equal(c.events.length, 1);

c = addDocument(c, { id: 'doc-invoice', role: 'invoice', name: 'faktura.pdf', storage_key: 'private/case-1/doc-invoice', sha256: 'abc' }, { clock });
c = addDocument(c, { id: 'doc-quote', role: 'quote', name: 'tilbud.pdf', storage_key: 'private/case-1/doc-quote', sha256: 'def' }, { clock });
assert.equal(c.documents.length, 2);
assert.throws(() => addDocument(c, { id: 'doc-invoice', role: 'invoice' }, { clock }), /Duplicate/);

c = transitionCase(c, 'documents_ready', { clock });
c = addAnalysis(c, { id: 'analysis-1', engine_version: '0.33.0', status: 'attention', result_hash: 'hash1' }, { clock });
c = transitionCase(c, 'analysis_ready', { clock });
c = addPayment(c, { id: 'payment-1', amount_nok: 29, currency: 'NOK', status: 'paid' }, { clock });
c = transitionCase(c, 'paid', { clock });
c = addDraft(c, { id: 'draft-1', mode: 'objection', text: 'Hei, dette er et kontrollert testutkast.' }, { clock });
c = transitionCase(c, 'draft_ready', { clock });
c = transitionCase(c, 'sent_to_supplier', { clock });
c = addSupplierResponse(c, { id: 'response-1', document_id: 'doc-response-1' }, { clock });
c = transitionCase(c, 'supplier_response_received', { clock });
c = addFollowUp(c, { id: 'followup-1', text: 'Takk for svaret. Følgende står fortsatt åpent.' }, { clock });
c = transitionCase(c, 'follow_up_ready', { clock });

assert.equal(c.payments[0].amount_nok, 29);
assert.equal(c.analyses[0].engine_version, '0.33.0');
assert.equal(c.supplier_responses.length, 1);
assert.equal(c.follow_ups.length, 1);
assert.ok(c.events.length >= 10);

const before = c;
const after = transitionCase(c, 'sent_to_supplier', { clock });
assert.notEqual(before, after, 'case updates should return new state objects');
assert.equal(before.state, 'follow_up_ready');
assert.equal(after.state, 'sent_to_supplier');

const summary = publicCaseSummary(after);
assert.deepEqual(Object.keys(summary).sort(), [
  'analysis_count','created_at','document_count','has_payment','id','latest_analysis_status','state','supplier_response_count','updated_at'
].sort());
assert.equal(summary.document_count, 2);
assert.equal(summary.has_payment, true);
assert.equal(summary.latest_analysis_status, 'attention');

assert.throws(() => transitionCase(after, 'analysis_ready', { clock }), /Illegal transition/);
assert.throws(() => addPayment(after, { id: 'bad', amount_nok: 0 }, { clock }), /Valid payment/);

console.log('OK: case lifecycle preserves history across documents, analysis, 29 NOK payment, drafts, supplier response and follow-up.');
