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
  'reisegarantifondet_members',
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

const verified = ['arbeidstilsynet_cleaning', 'finanstilsynet_registry', 'vegvesen_parking'];
for (const id of verified) {
  const item = config.registers[id];
  assert.ok(item, `missing source-verified register ${id}`);
  assert.equal(item.status, 'source_verified_not_live', `${id}: source verification must not activate runtime`);
  assert.equal(item.machine_source_verified, true);
  assert.match(item.machine_source_url, /^https:\/\//);
  assert.ok(Number(item.max_age_hours) <= Number(config.policy.default_max_age_hours));
  assert.match(item.notes, /Runtime.*stengt/i);
  assert.match(item.notes, /[Mm]anglende treff.*(?:aldri|ikke).*negativt bevis/i);
}

const cleaning = config.registers.arbeidstilsynet_cleaning;
assert.equal(cleaning.source_update_frequency, 'daily');
assert.match(cleaning.dataset_catalog_url, /^https:\/\/data\.norge\.no\//);
assert.equal(cleaning.machine_source_url, 'https://registerdata.arbeidstilsynet.no/renhold_register.xml');
assert.match(cleaning.schema_url, /RegisterXML6\.xsd$/);

const finance = config.registers.finanstilsynet_registry;
assert.equal(finance.machine_source_url, 'https://api.finanstilsynet.no/registry/');
assert.match(finance.schema_url, /swagger\/v2\/swagger\.json$/);
assert.deepEqual(finance.applicable_industries, ['debt_collection', 'finance', 'insurance']);
assert.match(finance.notes, /org\.nr\.-oppslag/i);
assert.match(finance.notes, /pagineringsgrenser/i);

const parking = config.registers.vegvesen_parking;
assert.match(parking.machine_source_url, /^https:\/\/www\.vegvesen\.no\/ws\//);
assert.deepEqual(parking.applicable_industries, ['parking']);
assert.match(parking.notes, /historisk relevans/i);

const travel = config.registers.reisegarantifondet_members;
assert.equal(travel.official_export_available, false);
assert.equal('machine_source_url' in travel, false);
assert.deepEqual(travel.applicable_industries, ['package_travel']);
assert.match(travel.landing_url, /^https:\/\/reisegarantifondet\.no\/medlemmer\/$/);
assert.match(travel.notes, /skjult scraping/i);
assert.match(travel.notes, /runtime forblir stengt/i);
assert.match(travel.notes, /[Mm]anglende treff.*ikke.*negativt bevis/i);

for (const item of Object.values(config.registers)) {
  assert.notEqual(item.status, 'live', 'no specialist register may become live through source-verification metadata alone');
}
assert.match(config.registers.vegvesen_control_body.notes, /vanlig verkstedgodkjenning er ikke tilstrekkelig/i);
assert.match(config.registers.fgas_certification.notes, /ikke.*negativt funn/i);

console.log('OK specialist registers distinguish verified sources from manual-only sources and remain fail closed.');
