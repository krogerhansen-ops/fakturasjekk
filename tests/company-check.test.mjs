import assert from 'node:assert/strict';
import { compareSellerToRegistry, checkSellerCompany, companyCheckFacts } from '../engine/company-check.mjs';

const entity = {
  organization_number: '509100675',
  name: 'Demo Butikk AS',
  organization_form: { code: 'AS', description: 'Aksjeselskap' },
  registered_in_vat: true,
  vat_registration_date: '2021-05-01',
  registered_in_business_register: true,
  bankrupt: false,
  under_liquidation: false,
  under_forced_liquidation_or_dissolution: false,
  deleted_date: null,
  registration_date: '2020-01-01',
  business_code: { code: '47.400', description: 'Detaljhandel' },
  business_address: null,
  source: 'brreg_enhetsregisteret',
  source_version: 'v2'
};

const matching = compareSellerToRegistry({
  seller_name: 'DEMO BUTIKK AS',
  seller_org_number: 'NO 509 100 675 MVA',
  seller_mva_marker_present: true,
  invoice_date: '2026-08-01',
  lookup: { status: 'verified', entity }
});
assert.equal(matching.status, 'verified');
assert.equal(matching.comparison.organization_number, 'matches');
assert.equal(matching.comparison.name, 'matches');
assert.equal(matching.comparison.vat_marker, 'matches_current_registry');
assert.deepEqual(matching.flags, []);

const nameDifferent = compareSellerToRegistry({
  seller_name: 'Demo-butikk Skien',
  seller_org_number: '509100675',
  lookup: { status: 'verified', entity }
});
assert.equal(nameDifferent.comparison.name, 'different');
assert.ok(nameDifferent.flags.includes('seller_name_mismatch'));

const currentNotRegistered = compareSellerToRegistry({
  seller_name: 'Demo Butikk AS',
  seller_org_number: '509100675',
  seller_mva_marker_present: true,
  invoice_date: '2024-01-01',
  lookup: { status: 'verified', entity: { ...entity, registered_in_vat: false, vat_registration_date: null } }
});
assert.equal(currentNotRegistered.comparison.vat_marker, 'historical_verification_required');
assert.ok(currentNotRegistered.flags.includes('seller_mva_historical_status_unresolved'));
assert.equal(currentNotRegistered.flags.includes('seller_mva_marker_mismatch'), false);

const predatesRegistration = compareSellerToRegistry({
  seller_name: 'Demo Butikk AS',
  seller_org_number: '509100675',
  seller_mva_marker_present: true,
  invoice_date: '2021-04-30',
  lookup: { status: 'verified', entity }
});
assert.equal(predatesRegistration.comparison.vat_marker, 'invoice_predates_registry_registration');
assert.ok(predatesRegistration.flags.includes('seller_mva_invoice_predates_registration'));

const markerNotProvided = compareSellerToRegistry({
  seller_name: 'Demo Butikk AS',
  seller_org_number: '509100675',
  lookup: { status: 'verified', entity }
});
assert.equal(markerNotProvided.comparison.vat_marker, 'not_compared');
assert.equal(markerNotProvided.flags.includes('seller_mva_historical_status_unresolved'), false);

const nameAmbiguous = compareSellerToRegistry({ seller_name: 'Demo', lookup: { status: 'ambiguous', entity: null } });
assert.match(nameAmbiguous.customer_note, /velger ikke virksomhet ved gjetting/i);

const removed = compareSellerToRegistry({ seller_org_number: '509100675', lookup: { status: 'removed', entity: null } });
assert.match(removed.customer_note, /fjernet fra offentlig avgivelse/i);

const client = {
  async lookupByOrganizationNumber() { return { status: 'verified', entity }; },
  async searchByExactName() { throw new Error('should not search when org number exists'); }
};
const checked = await checkSellerCompany({ client, seller_name: 'Demo Butikk AS', seller_org_number: '509100675', seller_mva_marker_present: true, invoice_date: '2026-08-01' });
assert.equal(checked.status, 'verified');
assert.equal(checked.comparison.vat_marker, 'matches_current_registry');

const unavailableClient = {
  async lookupByOrganizationNumber() { const error = new Error('network'); error.code = 'brreg_unavailable'; throw error; },
  async searchByExactName() { throw new Error('unused'); }
};
const unavailable = await checkSellerCompany({ client: unavailableClient, seller_org_number: '509100675' });
assert.equal(unavailable.status, 'unavailable');
assert.match(unavailable.customer_note, /ikke tilgjengelig/i);

const derived = companyCheckFacts(nameDifferent);
assert.equal(derived.facts.registry_seller_name, 'Demo Butikk AS');
assert.equal(derived.origins.registry_seller_name.type, 'registry');
assert.equal(derived.facts.seller_name_mismatch, true);
assert.equal(derived.origins.seller_name_mismatch.type, 'calculated');

const unresolvedFacts = companyCheckFacts(currentNotRegistered);
assert.equal(unresolvedFacts.facts.seller_mva_historical_status_unresolved, true);
assert.match(unresolvedFacts.origins.seller_mva_historical_status_unresolved.note, /ingen negativ konklusjon/i);

console.log('OK company check keeps register facts separate and handles VAT history fail-closed using invoice/registration dates.');
