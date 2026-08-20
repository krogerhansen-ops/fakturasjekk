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

const currentConsistent = compareSellerToRegistry({
  seller_name: 'DEMO BUTIKK AS',
  seller_org_number: 'NO 509 100 675 MVA',
  seller_mva_marker_present: true,
  invoice_date: '2025-04-10',
  lookup: { status: 'verified', entity }
});
assert.equal(currentConsistent.status, 'verified');
assert.equal(currentConsistent.comparison.organization_number, 'matches');
assert.equal(currentConsistent.comparison.name, 'matches');
assert.equal(currentConsistent.comparison.vat_marker, 'current_registry_consistent');
assert.equal(currentConsistent.comparison.vat_marker_basis, 'current_status_only');
assert.equal(currentConsistent.flags.includes('seller_mva_marker_mismatch'), false);
assert.match(currentConsistent.customer_note, /ikke som bevis for historisk MVA-registrering/i);

const nameDifferent = compareSellerToRegistry({
  seller_name: 'Demo-butikk Skien',
  seller_org_number: '509100675',
  lookup: { status: 'verified', entity }
});
assert.equal(nameDifferent.comparison.name, 'different');
assert.ok(nameDifferent.flags.includes('seller_name_mismatch'));

const historicalUnresolved = compareSellerToRegistry({
  seller_name: 'Demo Butikk AS',
  seller_org_number: '509100675',
  seller_mva_marker_present: true,
  invoice_date: '2024-03-15',
  lookup: { status: 'verified', entity: { ...entity, registered_in_vat: false } }
});
assert.equal(historicalUnresolved.comparison.vat_marker, 'historical_status_unresolved');
assert.equal(historicalUnresolved.comparison.vat_marker_basis, 'current_status_only');
assert.ok(historicalUnresolved.flags.includes('seller_mva_historical_status_unresolved'));
assert.equal(historicalUnresolved.flags.includes('seller_mva_marker_mismatch'), false);
assert.match(historicalUnresolved.customer_note, /behandles ikke som et avvik/i);

const verifiedHistoricalMismatch = compareSellerToRegistry({
  seller_name: 'Demo Butikk AS',
  seller_org_number: '509100675',
  seller_mva_marker_present: true,
  invoice_date: '2024-03-15',
  lookup: {
    status: 'verified',
    entity: { ...entity, registered_in_vat: true },
    historical_vat: {
      status: 'verified',
      invoice_date: '2024-03-15',
      registered_in_vat: false,
      source: 'verified_historical_source',
      source_version: 'test-v1'
    }
  }
});
assert.equal(verifiedHistoricalMismatch.comparison.vat_marker, 'different');
assert.equal(verifiedHistoricalMismatch.comparison.vat_marker_basis, 'verified_historical_status');
assert.ok(verifiedHistoricalMismatch.flags.includes('seller_mva_marker_mismatch'));
assert.equal(verifiedHistoricalMismatch.vat_at_invoice_date.registered_in_vat, false);

const verifiedHistoricalMatch = compareSellerToRegistry({
  seller_name: 'Demo Butikk AS',
  seller_org_number: '509100675',
  seller_mva_marker_present: true,
  invoice_date: '2024-03-15',
  lookup: {
    status: 'verified',
    entity: { ...entity, registered_in_vat: false },
    historical_vat: {
      status: 'verified',
      invoice_date: '2024-03-15',
      registered_in_vat: true,
      source: 'verified_historical_source'
    }
  }
});
assert.equal(verifiedHistoricalMatch.comparison.vat_marker, 'matches');
assert.equal(verifiedHistoricalMatch.flags.includes('seller_mva_marker_mismatch'), false);

const wrongDateHistory = compareSellerToRegistry({
  seller_mva_marker_present: true,
  invoice_date: '2024-03-15',
  lookup: {
    status: 'verified',
    entity: { ...entity, registered_in_vat: false },
    historical_vat: {
      status: 'verified',
      invoice_date: '2024-03-16',
      registered_in_vat: false
    }
  }
});
assert.equal(wrongDateHistory.comparison.vat_marker, 'historical_status_unresolved');
assert.equal(wrongDateHistory.flags.includes('seller_mva_marker_mismatch'), false);

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

let historicalLookupArgs = null;
const client = {
  async lookupByOrganizationNumber() { return { status: 'verified', entity }; },
  async searchByExactName() { throw new Error('should not search when org number exists'); },
  async lookupVatStatusAtDate(org, date) {
    historicalLookupArgs = { org, date };
    return {
      status: 'verified',
      invoice_date: date,
      registered_in_vat: true,
      source: 'verified_historical_source'
    };
  }
};
const checked = await checkSellerCompany({
  client,
  seller_name: 'Demo Butikk AS',
  seller_org_number: '509100675',
  seller_mva_marker_present: true,
  invoice_date: '2024-03-15'
});
assert.equal(checked.status, 'verified');
assert.deepEqual(historicalLookupArgs, { org: '509100675', date: '2024-03-15' });
assert.equal(checked.comparison.vat_marker, 'matches');
assert.equal(checked.comparison.vat_marker_basis, 'verified_historical_status');

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
assert.match(derived.origins.registry_seller_mva_registered.note, /dagens MVA-registreringsstatus/i);

const historicalDerived = companyCheckFacts(verifiedHistoricalMismatch);
assert.equal(historicalDerived.facts.registry_seller_mva_registered_at_invoice_date, false);
assert.equal(historicalDerived.origins.registry_seller_mva_registered_at_invoice_date.confidence, 'authoritative_historical_registry');
assert.equal(historicalDerived.facts.seller_mva_marker_mismatch, true);

const unresolvedDerived = companyCheckFacts(historicalUnresolved);
assert.equal('seller_mva_marker_mismatch' in unresolvedDerived.facts, false);
assert.equal('registry_seller_mva_registered_at_invoice_date' in unresolvedDerived.facts, false);

console.log('OK company check separates current and historical VAT status and only raises MVA mismatch from verified invoice-date history.');
