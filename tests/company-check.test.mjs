import assert from 'node:assert/strict';
import { compareSellerToRegistry, checkSellerCompany, companyCheckFacts } from '../engine/company-check.mjs';

const entity = {
  organization_number: '509100675',
  name: 'Demo Butikk AS',
  organization_form: { code: 'AS', description: 'Aksjeselskap' },
  registered_in_vat: true,
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
  lookup: { status: 'verified', entity }
});
assert.equal(matching.status, 'verified');
assert.equal(matching.comparison.organization_number, 'matches');
assert.equal(matching.comparison.name, 'matches');
assert.equal(matching.comparison.vat_marker, 'matches');
assert.deepEqual(matching.flags, []);

const nameDifferent = compareSellerToRegistry({
  seller_name: 'Demo-butikk Skien',
  seller_org_number: '509100675',
  lookup: { status: 'verified', entity }
});
assert.equal(nameDifferent.comparison.name, 'different');
assert.ok(nameDifferent.flags.includes('seller_name_mismatch'));

const mvaDifferent = compareSellerToRegistry({
  seller_name: 'Demo Butikk AS',
  seller_org_number: '509100675',
  seller_mva_marker_present: true,
  lookup: { status: 'verified', entity: { ...entity, registered_in_vat: false } }
});
assert.equal(mvaDifferent.comparison.vat_marker, 'different');
assert.ok(mvaDifferent.flags.includes('seller_mva_marker_mismatch'));

const markerNotProvided = compareSellerToRegistry({
  seller_name: 'Demo Butikk AS',
  seller_org_number: '509100675',
  lookup: { status: 'verified', entity }
});
assert.equal(markerNotProvided.comparison.vat_marker, 'not_compared');
assert.equal(markerNotProvided.flags.includes('seller_mva_marker_mismatch'), false);

const nameAmbiguous = compareSellerToRegistry({ seller_name: 'Demo', lookup: { status: 'ambiguous', entity: null } });
assert.match(nameAmbiguous.customer_note, /velger ikke virksomhet ved gjetting/i);

const removed = compareSellerToRegistry({ seller_org_number: '509100675', lookup: { status: 'removed', entity: null } });
assert.match(removed.customer_note, /fjernet fra offentlig avgivelse/i);

const client = {
  async lookupByOrganizationNumber() { return { status: 'verified', entity }; },
  async searchByExactName() { throw new Error('should not search when org number exists'); }
};
const checked = await checkSellerCompany({ client, seller_name: 'Demo Butikk AS', seller_org_number: '509100675', seller_mva_marker_present: true });
assert.equal(checked.status, 'verified');

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

console.log('OK company check keeps register facts separate, compares deterministically and never guesses ambiguous firms.');
