import assert from 'node:assert/strict';
import { requiredFieldsForDocuments, confirmationNeeds, validateFactConfirmations, mergeConfirmedFacts } from '../server/fact-confirmation.mjs';

const catalog = { fields: {
  invoice_total: { type: 'number' },
  invoice_number: { type: 'string' },
  agreed_price: { type: 'number' },
  price_basis: { type: 'enum', values: ['fixed','estimate','quote','hourly','unknown'] },
  collection_document_sent_date: { type: 'date' },
  itemized_invoice_requested: { type: 'boolean', positive_only: true }
}};
const documents = [
  { id: 'inv-1', role: 'invoice' },
  { id: 'q-1', role: 'quote' },
  { id: 'notice-1', role: 'collection_notice' },
  { id: 'msg-1', role: 'correspondence' }
];
assert.deepEqual(requiredFieldsForDocuments(documents), ['invoice_total','invoice_number','agreed_price']);
const validated = {
  accepted: { invoice_number: { value: 'INV-1', confidence: 0.99, source_document_id: 'inv-1', source_page: 1 } },
  review: [
    { field: 'invoice_total', value: 146000, confidence: 0.82, source_document_id: 'inv-1', source_page: 1, reason: 'lav confidence' },
    { field: 'collection_document_sent_date', value: '2026-08-01', confidence: 0.80, source_document_id: 'notice-1', source_page: 1, reason: 'lav confidence' },
    { field: 'itemized_invoice_requested', value: true, confidence: 0.80, source_document_id: 'msg-1', source_page: 1, reason: 'lav confidence' }
  ],
  rejected: [], counts: { accepted: 1, review: 3, rejected: 0 }
};
const needs = confirmationNeeds({ validated, documents });
assert.deepEqual(needs.map(n => n.field).sort(), ['agreed_price','collection_document_sent_date','invoice_total','itemized_invoice_requested']);

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

const validDate = validateFactConfirmations({
  items: [{ field: 'collection_document_sent_date', value: '2026-08-01', source_document_id: 'notice-1', source_page: 1, confirmed_by_user: true }],
  catalog, documents, allowedNeeds: needs
});
assert.equal(validDate.valid, true);
assert.equal(validDate.confirmations.collection_document_sent_date.value, '2026-08-01');

const invalidDate = validateFactConfirmations({
  items: [{ field: 'collection_document_sent_date', value: '2026-02-30', source_document_id: 'notice-1', source_page: 1, confirmed_by_user: true }],
  catalog, documents, allowedNeeds: needs
});
assert.equal(invalidDate.valid, false);
assert.match(invalidDate.errors[0], /Ugyldig verdi/i);

const wrongSource = validateFactConfirmations({
  items: [{ field: 'collection_document_sent_date', value: '2026-08-01', source_document_id: 'not-uploaded', source_page: 1, confirmed_by_user: true }],
  catalog, documents, allowedNeeds: needs
});
assert.equal(wrongSource.valid, false);
assert.match(wrongSource.errors[0], /kildedokument/i);

const positiveOnlyFalse = validateFactConfirmations({
  items: [{ field: 'itemized_invoice_requested', value: false, source_document_id: 'msg-1', source_page: 1, confirmed_by_user: true }],
  catalog, documents, allowedNeeds: needs
});
assert.equal(positiveOnlyFalse.valid, false);
assert.match(positiveOnlyFalse.errors[0], /bare bekreftes som true/i);

const valid = validateFactConfirmations({
  items: [
    { field: 'invoice_total', value: 146000, source_document_id: 'inv-1', source_page: 1, confirmed_by_user: true },
    { field: 'agreed_price', value: 120000, source_document_id: 'q-1', source_page: 1, confirmed_by_user: true },
    { field: 'collection_document_sent_date', value: '2026-08-01', source_document_id: 'notice-1', source_page: 1, confirmed_by_user: true },
    { field: 'itemized_invoice_requested', value: true, source_document_id: 'msg-1', source_page: 1, confirmed_by_user: true }
  ], catalog, documents, allowedNeeds: needs
});
assert.equal(valid.valid, true);
const merged = mergeConfirmedFacts({ validated, confirmations: valid.confirmations, documents });
assert.equal(merged.safe_to_continue, true);
assert.equal(merged.facts.invoice_total, 146000);
assert.equal(merged.facts.agreed_price, 120000);
assert.equal(merged.facts.collection_document_sent_date, '2026-08-01');
assert.equal(merged.facts.itemized_invoice_requested, true);
assert.equal(merged.origins.invoice_number.type, 'documented');
assert.equal(merged.origins.invoice_total.type, 'user_provided');
assert.match(merged.origins.invoice_total.note, /Ikke maskinelt dokumentert/);

console.log('OK safe fact confirmation including source-backed legal dates and positive-only booleans.');
