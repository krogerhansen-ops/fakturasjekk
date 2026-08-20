import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validateExtractorEnvelope, extractorInstructions } from '../server/extractor-contract.mjs';

const catalog = JSON.parse(fs.readFileSync(new URL('../config/extraction-fields.json', import.meta.url), 'utf8'));
const documents = [{ id: 'inv-1', role: 'invoice' }];

for (const sector of [
  'electricity_energy', 'telecom', 'insurance', 'taxi', 'passenger_transport', 'healthcare_public',
  'digital_service', 'parking', 'package_travel', 'housing_rent', 'dental', 'funeral'
]) {
  const result = validateExtractorEnvelope({ fields: {
    regulated_sector: { value: sector, confidence: 0.99, source_document_id: 'inv-1', source_page: 1 }
  } }, catalog, { documents });
  assert.equal(result.valid, true, `allowed regulated sector should validate: ${sector}`);
  assert.equal(result.fields.regulated_sector.value, sector);
}

const invented = validateExtractorEnvelope({ fields: {
  regulated_sector: { value: 'lawyer_says_special', confidence: 1, source_document_id: 'inv-1', source_page: 1 }
} }, catalog, { documents });
assert.equal(invented.valid, false);
assert.match(invented.contract_errors.join(' '), /ugyldig verdi\/type/i);

const instructions = extractorInstructions(catalog);
assert.match(instructions, /regulated_sector/);
assert.match(instructions, /Ikke klassifiser fra firmanavn alene/);
assert.match(instructions, /Ingen lovnavn, paragrafer/);

console.log('OK: regulated-sector extraction is closed-enum routing context, not free legal classification.');
