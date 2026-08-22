import fs from 'node:fs';
import path from 'node:path';

export function discoverPreactivationRegistries(rulesDir, { fsImpl = fs, pathImpl = path } = {}) {
  const names = fsImpl.readdirSync(rulesDir)
    .filter(name => name.endsWith('-candidates.json'))
    .sort();

  if (!names.length) throw new Error('At least one isolated *-candidates.json legal registry is required.');

  const registries = [];
  const rules = [];
  for (const name of names) {
    let data;
    try {
      data = JSON.parse(fsImpl.readFileSync(pathImpl.join(rulesDir, name), 'utf8'));
    } catch (error) {
      throw new Error(`${name}: invalid candidate registry JSON: ${error.message}`);
    }

    if (data.runtime !== false || data.purpose !== 'preactivation_only') {
      throw new Error(`${name} must remain isolated from runtime and use purpose=preactivation_only.`);
    }
    if (!Array.isArray(data.rules)) throw new Error(`${name}: candidate registry requires a rules array.`);

    registries.push({ name, data });
    for (const rule of data.rules) {
      if (!rule?.id) throw new Error(`${name}: candidate rule requires id.`);
      if (rule.status !== 'preactivation_candidate') throw new Error(`${rule.id}: preactivation rule must remain preactivation_candidate.`);
      if (!Array.isArray(rule.conditions) || !rule.conditions.length) throw new Error(`${rule.id}: preactivation rule must document activation conditions.`);
      if (!rule.source_url || !rule.expected_phrase) throw new Error(`${rule.id}: preactivation rule requires source_url and expected_phrase for monitoring.`);
      rules.push({ ...rule, registry_file: name });
    }
  }

  const ids = rules.map(rule => rule.id);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate legal rule id exists across preactivation registries.');

  return { registries, rules };
}
