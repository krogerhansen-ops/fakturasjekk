import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validateExtractorEnvelope } from '../server/extractor-contract.mjs';
import { validateExtraction, toEvidenceOrigins } from '../engine/extraction-policy.mjs';
import { analyzeCase } from '../engine/analyzer.mjs';

const catalog = JSON.parse(fs.readFileSync(new URL('../config/extraction-fields.json', import.meta.url), 'utf8'));
const policy = JSON.parse(fs.readFileSync(new URL('../config/extraction-policy.json', import.meta.url), 'utf8'));
const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));

const documents = [
  { id: 'invoice-1', role: 'invoice' },
  { id: 'quote-1', role: 'quote' },
  { id: 'sms-1', role: 'correspondence' }
];

const envelope = validateExtractorEnvelope({ fields: {
  invoice_total: { value: 18500, confidence: 0.99, source_document_id: 'invoice-1', source_page: 1 },
  invoice_number: { value: 'V-100', confidence: 0.99, source_document_id: 'invoice-1', source_page: 1 },
  agreed_price: { value: 10000, confidence: 0.99, source_document_id: 'quote-1', source_page: 1 },
  price_basis: { value: 'estimate', confidence: 0.95, source_document_id: 'quote-1', source_page: 1 },
  additional_work_detected: { value: true, confidence: 0.96, source_document_id: 'invoice-1', source_page: 2 },
  additional_work_amount: { value: 6600, confidence: 0.98, source_document_id: 'invoice-1', source_page: 2 },
  preliminary_examination_fee: { value: 1900, confidence: 0.98, source_document_id: 'invoice-1', source_page: 2 }
}}, catalog, { documents });
assert.equal(envelope.valid, true);

const validated = validateExtraction(envelope, policy);
assert.equal(validated.safe_to_continue, true);
const facts = Object.fromEntries(Object.entries(validated.accepted).map(([field, item]) => [field, item.value]));
const origins = toEvidenceOrigins(validated);
assert.equal(origins.additional_work_amount.type, 'documented');
assert.equal(origins.preliminary_examination_fee.source_id, 'invoice-1');

const analysis = analyzeCase({
  ...facts,
  party_type: 'consumer',
  case_type: 'handcraft_service'
}, registry);

assert.ok(analysis.findings.some(f => f.code === 'ADDITIONAL_WORK_AUTHORIZATION_UNCLEAR'));
assert.equal(analysis.findings.some(f => f.code === 'ADDITIONAL_WORK_NO_DOCUMENTED_AUTHORIZATION'), false);
assert.ok(analysis.findings.some(f => f.code === 'PRELIMINARY_FEE_DISCLOSURE_UNCLEAR'));
assert.equal(analysis.findings.some(f => f.code === 'PRELIMINARY_FEE_NOT_DISCLOSED'), false);
assert.ok(analysis.rule_ids.includes('HTJL_9_ADDITIONAL_WORK'));
assert.ok(analysis.rule_ids.includes('HTJL_34_PRELIMINARY_EXAMINATION'));

const supportedDisclosure = validateExtractorEnvelope({ fields: {
  preliminary_fee_disclosed_beforehand: { value: true, confidence: 0.96, source_document_id: 'quote-1', source_page: 1 },
  additional_work_authorization_documented: { value: true, confidence: 0.96, source_document_id: 'sms-1', source_page: 1 },
  additional_work_price_documented: { value: true, confidence: 0.96, source_document_id: 'sms-1', source_page: 1 }
}}, catalog, { documents });
assert.equal(supportedDisclosure.valid, true);

const withPositiveSupport = validateExtraction(supportedDisclosure, policy);
assert.equal(withPositiveSupport.safe_to_continue, true);
const supportedFacts = Object.fromEntries(Object.entries(withPositiveSupport.accepted).map(([field, item]) => [field, item.value]));
const supportedAnalysis = analyzeCase({
  ...facts,
  ...supportedFacts,
  party_type: 'consumer',
  case_type: 'handcraft_service'
}, registry);
assert.equal(supportedAnalysis.findings.some(f => f.code === 'ADDITIONAL_WORK_AUTHORIZATION_UNCLEAR'), false);
assert.equal(supportedAnalysis.findings.some(f => f.code === 'PRELIMINARY_FEE_DISCLOSURE_UNCLEAR'), false);

console.log('OK P0 document facts preserve source roles and treat missing authorization/disclosure as uncertainty, not proof.');
