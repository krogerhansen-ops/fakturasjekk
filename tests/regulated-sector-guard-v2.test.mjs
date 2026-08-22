import fs from 'node:fs';
import assert from 'node:assert/strict';
import { REGULATED_SECTOR_VALUES, resolveRegulatedSectorGuard, assertRegulatedSectorValue } from '../engine/regulated-sector-guard.mjs';
import { runCase } from '../engine/case-service.mjs';
import { validateExtractorEnvelope, extractorInstructions } from '../server/extractor-contract.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(new URL('../config/extraction-fields.json', import.meta.url), 'utf8'));

const expected = [
  'electricity_energy',
  'telecom',
  'insurance',
  'taxi',
  'passenger_transport',
  'healthcare_public',
  'digital_service',
  'parking',
  'package_travel',
  'housing_rent',
  'dental',
  'funeral'
];

assert.deepEqual([...REGULATED_SECTOR_VALUES], expected);
assert.deepEqual(catalog.fields.regulated_sector.values, expected, 'extractor catalog and runtime guard must use the same closed sector enum');
assert.equal(catalog.fields.regulated_sector.type, 'enum');
assert.equal(catalog.fields.regulated_sector.critical, false);
assert.ok(catalog.fields.regulated_sector.roles.includes('invoice'));
assert.ok(catalog.fields.regulated_sector.roles.includes('correspondence'));
assert.match(catalog.fields.regulated_sector.instruction, /ikke en juridisk konklusjon/i);
assert.match(catalog.fields.regulated_sector.instruction, /aldri.*firmanavn|firmanavn.*aldri/i);
assert.match(catalog.fields.regulated_sector.instruction, /utelat.*tvil/i);
assert.ok(catalog.principles.some(line => /Regulated-sector classification.*stop generic legal analysis/i.test(line)));

for (const value of expected) {
  assert.equal(assertRegulatedSectorValue(value), value);
  const guard = resolveRegulatedSectorGuard({ regulated_sector: value });
  assert.equal(guard.status, 'needs_clarification');
  assert.equal(guard.package_id, null);
  assert.ok(guard.customer_label);
  assert.match(guard.reason, /ikke har en aktivert og kvalitetssikret automatisk regelpakke/i);
  assert.equal(guard.relevant_frameworks.length, 0, 'blocking-only guard must not pretend to activate legal frameworks');
}
assert.equal(resolveRegulatedSectorGuard({}), null);
assert.equal(resolveRegulatedSectorGuard({ regulated_sector: 'made_up_sector' }), null);
assert.throws(() => assertRegulatedSectorValue('made_up_sector'), /Unknown regulated sector/);

const telecom = runCase({
  intake: { buyer_type: 'consumer', subject: 'service_quote', documents: ['invoice'] },
  facts: { regulated_sector: 'telecom', industry: 'other', invoice_total: 799 },
  origins: { regulated_sector: { type: 'documented', source_id: 'invoice-1' }, invoice_total: { type: 'documented', source_id: 'invoice-1' } },
  registry
});
assert.equal(telecom.status, 'needs_clarification');
assert.equal(telecom.legal_profile.id, 'regulated_telecom');
assert.equal(telecom.rule_package, null);
assert.equal(telecom.analysis, null, 'regulated sector must stop before deterministic legal analysis');
assert.equal(telecom.coverage, null, 'coverage cannot imply controls ran when legal routing stopped');
assert.equal(telecom.draft.allowed, false);
assert.match(telecom.draft.reason, /særregler/i);

const ordinaryOther = runCase({
  intake: { buyer_type: 'consumer', subject: 'service_quote', documents: ['invoice', 'quote'] },
  facts: { industry: 'other', agreed_price: 2000, invoice_total: 2000 },
  origins: {
    agreed_price: { type: 'documented', source_id: 'quote-1' },
    invoice_total: { type: 'documented', source_id: 'invoice-1' }
  },
  registry
});
assert.notEqual(ordinaryOther.status, 'needs_clarification', 'ordinary service_quote with no regulated-sector proof must keep existing generic service routing');
assert.equal(ordinaryOther.legal_profile.id, 'other_service');
assert.ok(ordinaryOther.analysis);
assert.ok(ordinaryOther.coverage);

const docs = [{ id: 'invoice-1', role: 'invoice' }];
const accepted = validateExtractorEnvelope({ fields: {
  regulated_sector: { value: 'parking', confidence: 0.99, source_document_id: 'invoice-1', source_page: 1 }
}}, catalog, { documents: docs });
assert.equal(accepted.valid, true);
assert.equal(accepted.fields.regulated_sector.value, 'parking');

const rejected = validateExtractorEnvelope({ fields: {
  regulated_sector: { value: 'social_media_guess', confidence: 1, source_document_id: 'invoice-1', source_page: 1 }
}}, catalog, { documents: docs });
assert.equal(rejected.valid, false);
assert.equal('regulated_sector' in rejected.fields, false);
assert.match(rejected.contract_errors[0], /ugyldig verdi\/type/);

const instructions = extractorInstructions(catalog);
assert.match(instructions, /regulated_sector: enum/);
assert.match(instructions, /electricity_energy\|telecom\|insurance/);
assert.match(instructions, /Aldri utled sektor fra firmanavn, merkevare eller avsendernavn alene/);

console.log('OK regulated sectors stop before generic legal routing while ordinary services remain supported.');
