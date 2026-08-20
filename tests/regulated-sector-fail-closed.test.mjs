import fs from 'node:fs';
import assert from 'node:assert/strict';
import { resolveServiceLegalProfile, legalRoutingCatalog } from '../engine/service-legal-router.mjs';

const extraction = JSON.parse(fs.readFileSync('config/extraction-fields.json', 'utf8'));
const industryValues = new Set(extraction.fields.industry.values);

const regulatedCases = [
  { industry: 'energy', id: 'regulated_energy_invoice', framework: 'kraftomsetningsforskriften' },
  { industry: 'telecom', id: 'regulated_telecom_invoice', framework: 'ekomloven' },
  { industry: 'insurance', id: 'regulated_insurance_invoice', framework: 'forsikringsavtaleloven' },
  { industry: 'healthcare_payment', id: 'regulated_healthcare_payment', framework: 'sektorspesifikke regler for pasientbetaling' },
  { industry: 'taxi', id: 'regulated_taxi_invoice', framework: 'prisopplysningsforskriften §§ 25d–25e' },
  { industry: 'regulated_transport', id: 'regulated_transport_invoice', framework: 'relevant transportregelverk' },
  { industry: 'finance', id: 'regulated_financial_service', framework: 'finansavtaleloven' }
];

for (const item of regulatedCases) {
  assert.ok(industryValues.has(item.industry), `${item.industry}: extraction enum must support fail-closed routing`);

  const serviceResult = resolveServiceLegalProfile({
    route: 'service_quote',
    facts: { industry: item.industry }
  });

  assert.equal(serviceResult.status, 'needs_clarification', `${item.industry}: must fail closed`);
  assert.equal(serviceResult.package_id, null, `${item.industry}: must not activate a generic package`);
  assert.equal(serviceResult.id, item.id, `${item.industry}: wrong clarification route`);
  assert.ok(serviceResult.relevant_frameworks.includes(item.framework), `${item.industry}: missing specialist framework`);

  const goodsResult = resolveServiceLegalProfile({
    route: 'goods',
    facts: { industry: item.industry }
  });

  assert.equal(goodsResult.status, 'needs_clarification', `${item.industry}: specialist sector must stop even when base route was misclassified as goods`);
  assert.equal(goodsResult.package_id, null);
}

const genericOther = resolveServiceLegalProfile({
  route: 'service_quote',
  facts: { industry: 'other' }
});
assert.equal(genericOther.status, 'ready');
assert.equal(genericOther.package_id, 'other_service');

const financedPurchase = resolveServiceLegalProfile({
  route: 'goods',
  facts: { industry: 'other', financing_detected: true }
});
assert.equal(financedPurchase.status, 'needs_clarification');
assert.equal(financedPurchase.id, 'consumer_credit_detected');
assert.equal(financedPurchase.package_id, null);

const catalog = legalRoutingCatalog();
for (const item of regulatedCases) {
  assert.ok(Array.isArray(catalog.fail_closed_industry_aliases[item.industry]));
  assert.ok(catalog.fail_closed_industry_aliases[item.industry].length > 0);
}

console.log('OK regulated sectors are extracted explicitly and fail closed before generic invoice-law routing.');
