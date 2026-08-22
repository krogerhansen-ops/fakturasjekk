import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  validateSpecialistRegisterConfig,
  assertSpecialistRegisterConfig,
  specialistRegisterActivationReadiness,
  SPECIALIST_REGISTER_STATUSES
} from '../engine/specialist-registry.mjs';

const config = JSON.parse(fs.readFileSync(new URL('../config/specialist-registers.json', import.meta.url), 'utf8'));
const validation = validateSpecialistRegisterConfig(config);
assert.equal(validation.valid, true, validation.errors.join('\n'));
assert.equal(validation.active_count, 0, 'source metadata must not activate any specialist register');
assert.equal(validation.register_count, Object.keys(config.registers).length);
assert.deepEqual(new Set(SPECIALIST_REGISTER_STATUSES), new Set(['prepared_not_live', 'source_verified_not_live', 'active']));
assert.doesNotThrow(() => assertSpecialistRegisterConfig(config));

for (const [id, definition] of Object.entries(config.registers)) {
  const readiness = specialistRegisterActivationReadiness(config, id);
  assert.equal(readiness.ready, false, `${id} unexpectedly became runtime-ready`);
  assert.ok(readiness.reasons.length > 0);
  if (definition.status === 'source_verified_not_live') {
    assert.ok(readiness.reasons.some(reason => /status is not active/.test(reason)), `${id}: verified source must still need explicit activation`);
  }
}

const basePolicy = structuredClone(config.policy);
const active = {
  version: 'test',
  policy: basePolicy,
  registers: {
    demo: {
      status: 'active',
      authority: 'Offentlig registereier',
      customer_label: 'Testregister',
      landing_url: 'https://authority.example/register',
      machine_source_url: 'https://authority.example/api',
      machine_source_verified: true,
      runtime_activation_reviewed: true,
      machine_contract_tested: true,
      matching_contract_tested: true,
      max_age_hours: 48,
      applicable_industries: ['test']
    }
  }
};
assert.equal(validateSpecialistRegisterConfig(active).valid, true);
assert.deepEqual(specialistRegisterActivationReadiness(active, 'demo'), { ready: true, reasons: [] });

for (const [field, value] of [
  ['machine_source_verified', false],
  ['runtime_activation_reviewed', false],
  ['machine_contract_tested', false],
  ['matching_contract_tested', false]
]) {
  const unsafe = structuredClone(active);
  unsafe.registers.demo[field] = value;
  const checked = validateSpecialistRegisterConfig(unsafe);
  assert.equal(checked.valid, false, `${field}=false must block active register`);
  assert.equal(specialistRegisterActivationReadiness(unsafe, 'demo').ready, false);
}

const verifiedButNotLive = structuredClone(active);
verifiedButNotLive.registers.demo.status = 'source_verified_not_live';
verifiedButNotLive.registers.demo.runtime_activation_reviewed = false;
verifiedButNotLive.registers.demo.machine_contract_tested = false;
verifiedButNotLive.registers.demo.matching_contract_tested = false;
assert.equal(validateSpecialistRegisterConfig(verifiedButNotLive).valid, true, 'verified source metadata is valid without runtime activation claims');
assert.equal(specialistRegisterActivationReadiness(verifiedButNotLive, 'demo').ready, false);

const badPolicy = structuredClone(config);
badPolicy.policy.missing_record_is_not_negative_proof = false;
assert.equal(validateSpecialistRegisterConfig(badPolicy).valid, false, 'negative-proof safeguard is mandatory');
assert.throws(() => assertSpecialistRegisterConfig(badPolicy), error => error?.code === 'invalid_specialist_register_config');

const badPrepared = structuredClone(config);
badPrepared.registers.reisegarantifondet_members.machine_source_verified = true;
assert.equal(validateSpecialistRegisterConfig(badPrepared).valid, false, 'manual-only source cannot claim machine verification');

console.log('OK specialist register contract requires explicit source, machine, matching and runtime review before activation.');
