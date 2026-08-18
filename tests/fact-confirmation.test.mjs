import assert from 'node:assert/strict';
import { requiredFieldsForDocuments, confirmationNeeds, validateFactConfirmations, mergeConfirmedFacts } from '../server/fact-confirmation.mjs';

const catalog = { fields: {
  invoice_total: { type: 'number' }, invoice_number: { type: 'string' }, agreed_price: { type: 'number' },
  price_basis: { type: 'enum', values: ['fixed','estimate','quote','hourly','unknown'] }
}};
const documents = [{ id: 'inv-1', role: 'invoice' }, { id: 'q-1', role: 'quote' }];
assert.deepEqual(requiredFieldsForDocuments(documents), ['invoice_total','invoice_number','agreed_price']);
const validated = {
  accepted: { invoice_number: { value: 'INV-1', confidence: 0.99, source_document_id: 'inv-1', source_page: 1 } },
  review: [{ field: 'invoice_total', value: 146000, confidence: 0.82, source_document_id: 'inv-1', source_page: 1, reason: 'lav confidence' }],
  rejected: [], counts: { accepted: 1, review: 1, rejected: 0 }
};
const needs = confirmationNeeds({ validated, documents });
assert.deepEqual(needs.map(n => n.field).sort(), ['agreed_price','invoice_total']);

const injection = validateFactConfirmations({
  items: [{ field: 'price_basis', value: 'estimate', source_document_id: 'q-1', source_page: 1, confirmed_by_user: true }],
  catalog, documents, allowedNeeds: needs
});
assert.equal(injection.valid, false);
assert.match(injection.errors[0], /ikke markert for avklaring/i);

const missingSource = validateFactConfirmations({
  items: [{ field: 'invoice_total', value: 146000, confirmed_by_user: true }], catalog, documents, allowedNeeds: needs
});
assert.equal(missingSource.valid, false);

const valid = validateFactConfirmations({
  items: [
    { field: 'invoice_total', value: 146000, source_document_id: 'inv-1', source_page: 1, confirmed_by_user: true },
    { field: 'agreed_price', value: 120000, source_document_id: 'q-1', source_page: 1, confirmed_by_user: true }
  ], catalog, documents, allowedNeeds: needs
});
assert.equal(valid.valid, true);
const merged = mergeConfirmedFacts({ validated, confirmations: valid.confirmations, documents });
assert.equal(merged.safe_to_continue, true);
assert.equal(merged.facts.invoice_total, 146000);
assert.equal(merged.facts.agreed_price, 120000);
assert.equal(merged.origins.invoice_number.type, 'documented');
assert.equal(merged.origins.invoice_total.type, 'user_provided');
assert.match(merged.origins.invoice_total.note, /Ikke maskinelt dokumentert/);

console.log('OK safe fact confirmation');
