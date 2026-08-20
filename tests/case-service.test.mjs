import fs from 'node:fs';
import assert from 'node:assert/strict';
import { runCase } from '../engine/case-service.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));

const caseResult = runCase({
  intake: {
    buyer_type: 'consumer',
    subject: 'handcraft_service',
    documents: ['invoice', 'quote']
  },
  facts: {
    price_basis: 'estimate',
    agreed_price: 120000,
    invoice_total: 146000,
    invoice_fee: 500,
    surcharge_documented: false
  },
  origins: {
    agreed_price: { type: 'documented', source_id: 'quote-1' },
    invoice_total: { type: 'documented', source_id: 'invoice-1' },
    invoice_fee: { type: 'documented', source_id: 'invoice-1' },
    price_basis: { type: 'documented', source_id: 'quote-1' },
    surcharge_documented: { type: 'user_provided' }
  },
  registry,
  user_note: 'Jeg fikk ikke beskjed om ekstraarbeid.',
  invoice_reference: '12345'
});

assert.equal(caseResult.intake.supported, true);
assert.equal(caseResult.analysis.status, 'attention');
assert.equal(caseResult.analysis.calculations.difference, 26000);
assert.ok(caseResult.evidence_summary.documented >= 4);
assert.ok(caseResult.evidence_summary.user_provided >= 2);
assert.equal(caseResult.draft.allowed, true);
assert.ok(caseResult.draft.text.includes('faktura 12345'));
assert.equal(/HTJL_|FKJL_|POF_|BOF_/.test(caseResult.draft.text), false);

const clean = runCase({
  intake: { buyer_type: 'consumer', subject: 'goods', documents: ['invoice', 'order_confirmation'] },
  facts: { agreed_price: 3490, invoice_total: 3490 },
  origins: {
    agreed_price: { type: 'documented', source_id: 'order-1' },
    invoice_total: { type: 'documented', source_id: 'invoice-1' }
  },
  registry
});
assert.equal(clean.status, 'clean');
assert.equal(clean.draft.allowed, false);

const rawCollectionInjection = runCase({
  intake: { buyer_type: 'consumer', subject: 'goods', documents: ['invoice', 'order_confirmation', 'collection_notice'] },
  facts: { agreed_price: 3490, invoice_total: 3490 },
  origins: {
    agreed_price: { type: 'documented', source_id: 'order-injection' },
    invoice_total: { type: 'documented', source_id: 'invoice-injection' }
  },
  collection: {
    stage: 'payment_request',
    collection_notice_fee: 999,
    notice_sent_date: '2026-08-01',
    collection_mode: 'own_collection',
    stated_delay_interest_rate_percent: 99,
    interest_rate_date: '2026-08-01',
    interest_basis: 'statutory_delay_interest'
  },
  registry
});
assert.equal(rawCollectionInjection.collection_context.stage, 'collection_notice');
assert.equal('collection_notice_fee' in rawCollectionInjection.collection_context, false);
assert.equal(rawCollectionInjection.analysis.findings.some(f => f.code === 'COLLECTION_NOTICE_FEE_ABOVE_DATE_CAP'), false);
assert.equal(rawCollectionInjection.analysis.findings.some(f => f.code === 'STATED_DELAY_INTEREST_ABOVE_DATE_RATE'), false);

const sourceBackedCollection = runCase({
  intake: { buyer_type: 'consumer', subject: 'goods', documents: ['invoice', 'order_confirmation', 'collection_notice'] },
  facts: {
    agreed_price: 3490,
    invoice_total: 3490,
    collection_document_sent_date: '2026-08-01',
    collection_notice_fee: 39
  },
  origins: {
    agreed_price: { type: 'documented', source_id: 'order-collection' },
    invoice_total: { type: 'documented', source_id: 'invoice-collection' },
    collection_document_sent_date: { type: 'documented', source_id: 'notice-collection' },
    collection_notice_fee: { type: 'documented', source_id: 'notice-collection' }
  },
  registry
});
assert.equal(sourceBackedCollection.collection_context.stage, 'collection_notice');
assert.equal(sourceBackedCollection.collection_context.collection_notice_fee, 39);
assert.equal(sourceBackedCollection.collection_context.source_backed, true);
assert.equal(sourceBackedCollection.status, 'attention');
assert.ok(sourceBackedCollection.analysis.findings.some(f => f.code === 'COLLECTION_NOTICE_FEE_ABOVE_DATE_CAP'));

const itemizedTimeline = runCase({
  intake: { buyer_type: 'consumer', subject: 'handcraft_service', documents: ['invoice', 'correspondence'] },
  facts: {
    invoice_total: 10000,
    agreed_price: 10000,
    itemized_invoice_requested: true,
    itemized_invoice_request_date: '2026-08-01',
    due_date: '2026-08-15'
  },
  origins: {
    invoice_total: { type: 'documented', source_id: 'invoice-37' },
    agreed_price: { type: 'documented', source_id: 'agreement-37' },
    itemized_invoice_requested: { type: 'documented', source_id: 'message-37' },
    itemized_invoice_request_date: { type: 'documented', source_id: 'message-37' },
    due_date: { type: 'documented', source_id: 'invoice-37' }
  },
  registry
});
assert.equal(itemizedTimeline.status, 'review');
assert.equal(itemizedTimeline.preactivation.checks[0].id, 'HTJL_37_ITEMIZED_INVOICE_TIMELINE');
assert.equal(itemizedTimeline.preactivation.checks[0].request_days_before_due, 14);
assert.equal(itemizedTimeline.preactivation.checks[0].legal_conclusion, false);
assert.ok(itemizedTimeline.analysis.questions.some(q => /må vurderes konkret/i.test(q)));
assert.equal(itemizedTimeline.analysis.rule_ids.includes('HTJL_37_ITEMIZED_INVOICE_TIMELINE'), false);

const b2b = runCase({
  intake: { buyer_type: 'business', subject: 'goods', documents: ['invoice'] },
  facts: { agreed_price: 1000, invoice_total: 1500 },
  registry
});
assert.equal(b2b.intake.supported, false);
assert.equal(b2b.analysis, null);
assert.equal(b2b.draft.allowed, false);

console.log('OK: case service uses source-backed collection facts, orchestrates legal analysis and preserves fail-closed scope.');
