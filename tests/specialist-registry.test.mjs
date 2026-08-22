import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  specialistRegisterDefinition,
  evaluateSpecialistRegistryResult,
  specialistRegistryEvidence
} from '../engine/specialist-registry.mjs';

const config = JSON.parse(fs.readFileSync(new URL('../config/specialist-registers.json', import.meta.url), 'utf8'));
const now = new Date('2026-08-19T20:30:00+02:00');

for (const id of ['dsb_elvirksomhet', 'vegvesen_workshop']) {
  const definition = specialistRegisterDefinition(config, id);
  assert.ok(definition);
  assert.equal(definition.status, 'prepared_not_live');
  assert.equal(definition.machine_source_verified, false);
  const blocked = evaluateSpecialistRegistryResult({
    definition,
    lookup: {
      status: 'verified',
      registered: false,
      authority: definition.authority,
      source_url: definition.landing_url,
      fetched_at: '2026-08-19T19:00:00+02:00'
    },
    now
  });
  assert.equal(blocked.usable, false);
  assert.equal(blocked.registered, null);
  assert.equal(blocked.status, 'source_not_active');
}

const activeDefinition = {
  status: 'active',
  machine_source_verified: true,
  runtime_activation_reviewed: true,
  machine_contract_tested: true,
  matching_contract_tested: true,
  authority: 'Offentlig registereier',
  customer_label: 'Offentlig testregister',
  landing_url: 'https://official.example/register',
  machine_source_url: 'https://official.example/register/export',
  applicable_industries: ['test'],
  max_age_hours: 48
};

const verified = evaluateSpecialistRegistryResult({
  definition: activeDefinition,
  lookup: {
    status: 'verified',
    registered: true,
    authority: 'Offentlig registereier',
    source_url: 'https://official.example/register/export',
    fetched_at: '2026-08-19T18:00:00+02:00',
    record: { organization_number: '509100675' }
  },
  now
});
assert.equal(verified.usable, true);
assert.equal(verified.registered, true);
assert.equal(verified.status, 'verified');

const evidence = specialistRegistryEvidence({ registerId: 'demo_register', evaluation: verified });
assert.equal(evidence.facts.specialist_demo_register_registered, true);
assert.equal(evidence.origins.specialist_demo_register_registered.type, 'registry');

const notFound = evaluateSpecialistRegistryResult({
  definition: activeDefinition,
  lookup: { status: 'not_found' },
  now
});
assert.equal(notFound.usable, false);
assert.equal(notFound.registered, null);
assert.equal(notFound.status, 'not_found_unproven');

const ambiguous = evaluateSpecialistRegistryResult({ definition: activeDefinition, lookup: { status: 'ambiguous' }, now });
assert.equal(ambiguous.usable, false);
assert.equal(ambiguous.registered, null);

const stale = evaluateSpecialistRegistryResult({
  definition: activeDefinition,
  lookup: {
    status: 'verified',
    registered: false,
    authority: 'Offentlig registereier',
    source_url: 'https://official.example/register/export',
    fetched_at: '2026-08-16T18:00:00+02:00'
  },
  now
});
assert.equal(stale.status, 'stale');
assert.equal(stale.usable, false);
assert.equal(stale.registered, null, 'stale negative must never become a customer conclusion');

const wrongAuthority = evaluateSpecialistRegistryResult({
  definition: activeDefinition,
  lookup: {
    status: 'verified',
    registered: false,
    authority: 'Ukjent tredjepart',
    source_url: 'https://third-party.example/register',
    fetched_at: '2026-08-19T18:00:00+02:00'
  },
  now
});
assert.equal(wrongAuthority.status, 'authority_mismatch');
assert.equal(wrongAuthority.usable, false);

const missingSource = evaluateSpecialistRegistryResult({
  definition: activeDefinition,
  lookup: {
    status: 'verified',
    registered: false,
    authority: 'Offentlig registereier',
    fetched_at: '2026-08-19T18:00:00+02:00'
  },
  now
});
assert.equal(missingSource.status, 'source_missing');
assert.equal(missingSource.usable, false);

const superficiallyActive = evaluateSpecialistRegistryResult({
  definition: { ...activeDefinition, runtime_activation_reviewed: false },
  lookup: {
    status: 'verified', registered: true, authority: 'Offentlig registereier',
    source_url: 'https://official.example/register/export', fetched_at: '2026-08-19T18:00:00+02:00'
  },
  now
});
assert.equal(superficiallyActive.status, 'source_not_active');
assert.equal(superficiallyActive.usable, false, 'status=active alone must never activate a register');

console.log('OK specialist registers remain fail-closed until source, runtime and matching contracts are all reviewed.');
