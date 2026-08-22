import fs from 'node:fs';
import assert from 'node:assert/strict';

const config = JSON.parse(fs.readFileSync(new URL('../config/specialist-registers.json', import.meta.url), 'utf8'));

assert.equal(config.policy.require_official_authority, true);
assert.equal(config.policy.ambiguous_match_is_not_verified, true);
assert.equal(config.policy.missing_record_is_not_negative_proof, true);
assert.equal(config.policy.stale_record_is_not_usable, true);

const prepared = [
  'dsb_elvirksomhet',
  'vegvesen_workshop',
  'vegvesen_control_body',
  'fgas_certification'
];
for (const id of prepared) {
  const item = config.registers[id];
  assert.ok(item, `missing specialist register ${id}`);
  assert.equal(item.status, 'prepared_not_live', `${id} must remain non-live until its machine source is verified`);
  assert.equal(item.machine_source_verified, false, `${id} must fail closed before verified machine source`);
  assert.match(item.landing_url, /^https:\/\//);
  assert.ok(item.authority && item.customer_label && item.notes);
  assert.ok(Number(item.max_age_hours) <= Number(config.policy.default_max_age_hours));
}

const cleaning = config.registers.arbeidstilsynet_cleaning;
assert.ok(cleaning);
assert.equal(cleaning.status, 'source_verified_not_live', 'verified source must still remain disconnected from runtime');
assert.equal(cleaning.machine_source_verified, true);
assert.equal(cleaning.source_update_frequency, 'daily');
assert.match(cleaning.dataset_catalog_url, /^https:\/\/data\.norge\.no\//);
assert.equal(cleaning.machine_source_url, 'https://registerdata.arbeidstilsynet.no/renhold_register.xml');
assert.match(cleaning.schema_url, /RegisterXML6\.xsd$/);
assert.ok(Number(cleaning.max_age_hours) <= Number(config.policy.default_max_age_hours));
assert.match(cleaning.notes, /Runtime-oppslag er fortsatt stengt/i);
assert.match(cleaning.notes, /Manglende treff.*aldri negativt bevis/i);

for (const item of Object.values(config.registers)) {
  assert.notEqual(item.status, 'live', 'no specialist register may become live through source-verification metadata alone');
}
assert.match(config.registers.vegvesen_control_body.notes, /vanlig verkstedgodkjenning er ikke tilstrekkelig/i);
assert.match(config.registers.fgas_certification.notes, /ikke.*negativt funn/i);

console.log('OK specialist registers distinguish verified source metadata from live runtime use and remain fail closed.');
