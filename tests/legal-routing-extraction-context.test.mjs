import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validateExtractorEnvelope, extractorInstructions } from '../server/extractor-contract.mjs';
import { validateExtraction } from '../engine/extraction-policy.mjs';
import { confirmationNeeds, validateFactConfirmations, mergeConfirmedFacts } from '../server/fact-confirmation.mjs';

const catalog = JSON.parse(fs.readFileSync(new URL('../config/extraction-fields.json', import.meta.url), 'utf8'));
const policy = JSON.parse(fs.readFileSync(new URL('../config/extraction-policy.json', import.meta.url), 'utf8'));
const documents = [
  { id: 'inv', role: 'invoice' },
  { id: 'agreement', role: 'agreement' },
  { id: 'message', role: 'correspondence' },
  { id: 'collection', role: 'payment_request' }
];

for (const field of ['industry','vehicle_service_context','transaction_nature','financing_detected']) {
  assert.ok(catalog.fields[field], `missing routing field ${field}`);
  assert.equal(catalog.fields[field].critical, false, `${field} is routing context, not a critical amount fact`);
}
assert.deepEqual(catalog.fields.industry.values, [
  'vehicle_repair','electrical','plumbing','heat_pump','installation','moving','cleaning','other'
]);
assert.match(catalog.fields.industry.instruction, /ikke klassifiser fra firmanavn eller merkevare alene/i);
assert.match(catalog.fields.vehicle_service_context.instruction, /ikke utled juridisk status fra verkstednavn/i);
assert.equal(catalog.fields.financing_detected.positive_only, true);

const exactWorkshop = validateExtractorEnvelope({ fields: {
  industry: { value: 'vehicle_repair', confidence: 0.97, source_document_id: 'inv', source_page: 1 },
  vehicle_service_context: { value: 'periodic_inspection', confidence: 0.98, source_document_id: 'inv', source_page: 1 }
}}, catalog, { documents });
assert.equal(exactWorkshop.valid, true);
assert.equal(exactWorkshop.fields.industry.value, 'vehicle_repair');
assert.equal(exactWorkshop.fields.vehicle_service_context.value, 'periodic_inspection');

const invalidEnum = validateExtractorEnvelope({ fields: {
  industry: { value: 'lawyer_guess', confidence: 1, source_document_id: 'inv', source_page: 1 }
}}, catalog, { documents });
assert.equal(invalidEnum.valid, false);
assert.match(invalidEnum.contract_errors[0], /ugyldig verdi\/type/i);

const wrongContextRole = validateExtractorEnvelope({ fields: {
  vehicle_service_context: { value: 'consumer_purchase_remedy', confidence: 0.99, source_document_id: 'collection', source_page: 1 }
}}, catalog, { documents });
assert.equal(wrongContextRole.valid, false, 'debt-collection document must not classify why the car entered the workshop');
assert.match(wrongContextRole.contract_errors[0], /kan ikke dokumenteres fra dokumentrollen payment_request/i);

const falseFinancing = validateExtractorEnvelope({ fields: {
  financing_detected: { value: false, confidence: 0.99, source_document_id: 'agreement', source_page: 1 }
}}, catalog, { documents });
assert.equal(falseFinancing.valid, false, 'absence of finance language is not proof that financing does not exist');
assert.match(falseFinancing.contract_errors[0], /positive-only/i);

const lowConfidence = validateExtractorEnvelope({ fields: {
  industry: { value: 'installation', confidence: 0.72, source_document_id: 'agreement', source_page: 2 },
  transaction_nature: { value: 'purchase_dominant', confidence: 0.74, source_document_id: 'agreement', source_page: 2 }
}}, catalog, { documents });
assert.equal(lowConfidence.valid, true, 'valid but uncertain routing context must reach confidence review, not be fabricated/rejected');
const reviewed = validateExtraction(lowConfidence, policy);
assert.equal(reviewed.safe_to_continue, false);
assert.deepEqual(reviewed.review.map(item => item.field).sort(), ['industry','transaction_nature']);
const needs = confirmationNeeds({ validated: reviewed, documents });
assert.deepEqual(needs.filter(item => ['industry','transaction_nature'].includes(item.field)).map(item => item.field).sort(), ['industry','transaction_nature']);

const confirmed = validateFactConfirmations({
  items: [
    { field: 'industry', value: 'installation', source_document_id: 'agreement', source_page: 2, confirmed_by_user: true },
    { field: 'transaction_nature', value: 'purchase_dominant', source_document_id: 'agreement', source_page: 2, confirmed_by_user: true }
  ],
  catalog,
  documents,
  allowedNeeds: needs
});
assert.equal(confirmed.valid, true);
const merged = mergeConfirmedFacts({ validated: reviewed, confirmations: confirmed.confirmations, documents });
assert.equal(merged.facts.industry, 'installation');
assert.equal(merged.facts.transaction_nature, 'purchase_dominant');
assert.equal(merged.origins.industry.type, 'user_provided');
assert.match(merged.origins.industry.note, /Ikke maskinelt dokumentert/i);

const badPositiveConfirmation = validateFactConfirmations({
  items: [{ field: 'financing_detected', value: false, source_document_id: 'agreement', source_page: 1, confirmed_by_user: true }],
  catalog,
  documents,
  allowedNeeds: [{ field: 'financing_detected' }]
});
assert.equal(badPositiveConfirmation.valid, false);
assert.match(badPositiveConfirmation.errors.join(' '), /bare bekreftes som true/i);

const instructions = extractorInstructions(catalog);
assert.match(instructions, /industry:/);
assert.match(instructions, /vehicle_service_context:/);
assert.match(instructions, /Ikke klassifiser fra firmanavn eller merkevare alene/i);
assert.match(instructions, /Ingen lovnavn, paragrafer, rettslige konklusjoner/i);

console.log('OK legal routing context is closed-enum, source-role-bound, brand-agnostic and user-confirmable without becoming documented legal proof.');
