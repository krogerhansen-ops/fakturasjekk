import fs from 'node:fs';
import assert from 'node:assert/strict';

const config = JSON.parse(fs.readFileSync(new URL('../config/specialist-registers.json', import.meta.url), 'utf8'));

assert.equal(config.policy.require_official_authority, true);
assert.equal(config.policy.ambiguous_match_is_not_verified, true);
assert.equal(config.policy.missing_record_is_not_negative_proof, true);
assert.equal(config.policy.stale_record_is_not_usable, true);

const required = [
  'dsb_elvirksomhet',
  'vegvesen_workshop',
  'vegvesen_control_body',
  'arbeidstilsynet_cleaning',
  'fgas_certification'
];
for (const id of required) {
  const item = config.registers[id];
  assert.ok(item, `missing specialist register ${id}`);
  assert.equal(item.status, 'prepared_not_live', `${id} must remain non-live until its machine source is verified`);
  assert.equal(item.machine_source_verified, false, `${id} must fail closed before verified machine source`);
  assert.match(item.landing_url, /^https:\/\//);
  assert.ok(item.authority && item.customer_label && item.notes);
  assert.ok(Number(item.max_age_hours) <= Number(config.policy.default_max_age_hours));
}

assert.match(config.registers.vegvesen_control_body.notes, /vanlig verkstedgodkjenning er ikke tilstrekkelig/i);
assert.match(config.registers.arbeidstilsynet_cleaning.notes, /Ikke godkjent/i);
assert.match(config.registers.fgas_certification.notes, /ikke.*negativt funn/i);

console.log('OK specialist registers stay official, source-verified, freshness-bounded and fail closed before live use.');
