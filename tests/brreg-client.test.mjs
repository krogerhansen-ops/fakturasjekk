import assert from 'node:assert/strict';
import {
  createBrregClient,
  normalizeBrregEntity
} from '../server/brreg-client.mjs';
import {
  normalizeCompanyName,
  normalizeOrganizationNumber,
  organizationNumberChecksumValid
} from '../engine/company-normalization.mjs';

assert.equal(normalizeOrganizationNumber('NO 509 100 675 MVA'), '509100675');
assert.equal(normalizeOrganizationNumber('509.100.675'), '509100675');
assert.equal(normalizeOrganizationNumber('abc'), null);
assert.equal(organizationNumberChecksumValid('509100675'), true);
assert.equal(organizationNumberChecksumValid('509100676'), false);
assert.equal(normalizeCompanyName(' Demo-Butikk AS '), 'DEMO BUTIKK AS');

const entityPayload = {
  organisasjonsnummer: '509100675',
  navn: 'Demo Butikk AS',
  organisasjonsform: { kode: 'AS', beskrivelse: 'Aksjeselskap' },
  registrertIMvaregisteret: true,
  registreringsdatoMerverdiavgiftsregisteret: '2021-05-01',
  registrertIForetaksregisteret: true,
  konkurs: false,
  underAvvikling: false,
  underTvangsavviklingEllerTvangsopplosning: false,
  registreringsdatoEnhetsregisteret: '2020-01-01',
  naeringskode1: { kode: '47.400', beskrivelse: 'Detaljhandel' },
  forretningsadresse: { adresse: ['Testveien 1'], postnummer: '0001', poststed: 'OSLO', kommune: 'Oslo', landkode: 'NO' }
};

const normalized = normalizeBrregEntity(entityPayload);
assert.deepEqual(Object.keys(normalized).sort(), [
  'bankrupt','business_address','business_code','deleted_date','name','organization_form','organization_number',
  'registered_in_business_register','registered_in_vat','registration_date','source','source_version',
  'under_forced_liquidation_or_dissolution','under_liquidation','vat_registration_date'
].sort());
assert.equal(normalized.vat_registration_date, '2021-05-01');
assert.equal('telefon' in normalized, false);
assert.equal('epostadresse' in normalized, false);

const calls = [];
const client = createBrregClient({
  fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify(entityPayload), { status: 200, headers: { 'content-type': 'application/json' } });
  }
});
const hit = await client.lookupByOrganizationNumber('509 100 675');
assert.equal(hit.status, 'verified');
assert.equal(hit.entity.name, 'Demo Butikk AS');
assert.equal(hit.entity.vat_registration_date, '2021-05-01');
assert.match(calls[0].url, /\/enheter\/509100675$/);
assert.equal(calls[0].options.headers.accept, 'application/vnd.brreg.enhetsregisteret.enhet.v2+json');
assert.equal(calls[0].options.redirect, 'error');
assert.equal(calls[0].options.cache, 'no-store');

let invalidCalled = false;
const invalidClient = createBrregClient({ fetchImpl: async () => { invalidCalled = true; throw new Error('should not call'); } });
const invalid = await invalidClient.lookupByOrganizationNumber('509100676');
assert.equal(invalid.status, 'invalid_organization_number');
assert.equal(invalidCalled, false);

const notFound = createBrregClient({ fetchImpl: async () => new Response(null, { status: 404 }) });
assert.equal((await notFound.lookupByOrganizationNumber('509100675')).status, 'not_found');

const removed = createBrregClient({ fetchImpl: async () => new Response(null, { status: 410 }) });
const gone = await removed.lookupByOrganizationNumber('509100675');
assert.equal(gone.status, 'removed');
assert.equal(gone.purge_cache, true);

const deletedPayload = { ...entityPayload, slettedato: '2026-06-01' };
const deletedClient = createBrregClient({ fetchImpl: async () => new Response(JSON.stringify(deletedPayload), { status: 200 }) });
assert.equal((await deletedClient.lookupByOrganizationNumber('509100675')).status, 'deleted');

const failing = createBrregClient({ fetchImpl: async () => new Response('{}', { status: 503 }) });
await assert.rejects(() => failing.lookupByOrganizationNumber('509100675'), error => error?.code === 'brreg_unavailable');

const searchPayload = { _embedded: { enheter: [entityPayload, { ...entityPayload, organisasjonsnummer: '999999999', navn: 'Demo Butikk Avdeling AS' }] } };
const searchClient = createBrregClient({ fetchImpl: async (url) => {
  assert.match(String(url), /navn=Demo(?:\+|%20)Butikk(?:\+|%20)AS/);
  assert.match(String(url), /navnMetodeForSoek=FORTLOEPENDE/);
  return new Response(JSON.stringify(searchPayload), { status: 200 });
} });
const byName = await searchClient.searchByExactName('Demo Butikk AS');
assert.equal(byName.status, 'verified');
assert.equal(byName.entity.organization_number, '509100675');

const ambiguousPayload = { _embedded: { enheter: [entityPayload, { ...entityPayload, organisasjonsnummer: '999999999' }] } };
const ambiguousClient = createBrregClient({ fetchImpl: async () => new Response(JSON.stringify(ambiguousPayload), { status: 200 }) });
assert.equal((await ambiguousClient.searchByExactName('Demo Butikk AS')).status, 'ambiguous');

console.log('OK Brreg client uses exact, versioned, no-store company lookup and captures VAT registration date without inferring history.');
