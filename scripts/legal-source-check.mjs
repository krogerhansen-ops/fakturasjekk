import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rulesDir = fileURLToPath(new URL('../rules/', import.meta.url));
const registry = JSON.parse(fs.readFileSync(path.join(rulesDir, 'rules.json'), 'utf8'));
const dynamicRates = JSON.parse(fs.readFileSync(path.join(rulesDir, 'dynamic-rates.json'), 'utf8'));
const transitions = JSON.parse(fs.readFileSync(path.join(rulesDir, 'transitions.json'), 'utf8'));

const preactivationRegistries = fs.readdirSync(rulesDir)
  .filter(name => name.endsWith('-candidates.json'))
  .sort()
  .map(name => ({
    name,
    data: JSON.parse(fs.readFileSync(path.join(rulesDir, name), 'utf8'))
  }));

if (!preactivationRegistries.length) {
  throw new Error('At least one isolated *-candidates.json legal registry is required.');
}
for (const { name, data } of preactivationRegistries) {
  if (data.runtime !== false || data.purpose !== 'preactivation_only') {
    throw new Error(`${name} must remain isolated from runtime.`);
  }
}

if (dynamicRates?.policy?.select_by_relevant_event_date !== true || dynamicRates?.policy?.never_apply_latest_rate_retroactively !== true) {
  throw new Error('Dynamic legal rates must be selected by relevant event date and must never be applied retroactively merely because they are latest.');
}

const runtimeMonitoredRules = registry.rules.filter(r => ['active', 'candidate'].includes(r.status));
const preactivationRules = preactivationRegistries.flatMap(({ name, data }) =>
  (data.rules ?? []).map(rule => ({ ...rule, registry_file: name }))
);
const allIds = [...runtimeMonitoredRules, ...preactivationRules].map(rule => rule.id);
if (new Set(allIds).size !== allIds.length) {
  throw new Error('Duplicate legal rule id exists across runtime and preactivation registries.');
}
for (const rule of preactivationRules) {
  if (rule.status !== 'preactivation_candidate') throw new Error(`${rule.id}: preactivation rule must remain preactivation_candidate.`);
  if (!Array.isArray(rule.conditions) || !rule.conditions.length) throw new Error(`${rule.id}: preactivation rule must document activation conditions.`);
}

const monitoredRules = [
  ...runtimeMonitoredRules.map(rule => ({ ...rule, registry_class: 'runtime' })),
  ...preactivationRules.map(rule => ({ ...rule, registry_class: `preactivation:${rule.registry_file}` }))
];

function normalizeHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&sect;|&#167;/gi, '§')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function fetchNormalized(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'Fakturasjekk-LegalSourceWatch/0.32 (+https://fakturasjekk.no)' },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return normalizeHtml(await response.text());
}

const failures = [];

for (const rule of monitoredRules) {
  try {
    const text = await fetchNormalized(rule.source_url);
    const expected = rule.expected_phrase.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!text.includes(expected)) {
      failures.push(`${rule.id} (${rule.status}/${rule.registry_class}): kontrollfrasen finnes ikke lenger i kilden: "${rule.expected_phrase}"`);
    } else {
      console.log(`OK ${rule.id} · ${rule.status} · ${rule.registry_class} · ${rule.law} ${rule.section}`);
    }
  } catch (error) {
    failures.push(`${rule.id} (${rule.status}/${rule.registry_class}): kildekontroll feilet: ${error.message}`);
  }
}

for (const rate of dynamicRates.rates ?? []) {
  if (!rate.id || !rate.source_url || !rate.expected_phrase || !rate.effective_from || !rate.effective_to) {
    failures.push(`${rate.id ?? 'UNKNOWN_RATE'}: dynamisk sats mangler id, kilde, kontrollfrase eller gyldighetsperiode.`);
    continue;
  }
  if (String(rate.effective_from) > String(rate.effective_to)) {
    failures.push(`${rate.id}: ugyldig effective_from/effective_to.`);
    continue;
  }
  try {
    const text = await fetchNormalized(rate.source_url);
    const expected = rate.expected_phrase.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!text.includes(expected)) {
      failures.push(`${rate.id} (dynamic_rate): kontrollfrasen finnes ikke lenger i kilden: "${rate.expected_phrase}"`);
    } else {
      console.log(`OK ${rate.id} · dynamic_rate · ${rate.effective_from}..${rate.effective_to}`);
    }
  } catch (error) {
    failures.push(`${rate.id} (dynamic_rate): kildekontroll feilet: ${error.message}`);
  }
}

for (const transition of transitions.transitions ?? []) {
  if (transition.status !== 'awaiting_commencement') continue;
  try {
    const currentText = await fetchNormalized(transition.current_source_url);
    const pending = transition.expected_pending_phrase.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!currentText.includes(pending)) {
      failures.push(`${transition.id}: overgangsfrasen er endret eller borte. Mulig ikrafttredelse/endring må kontrolleres straks. ${transition.action_when_changed}`);
    } else {
      console.log(`OK ${transition.id} · fortsatt awaiting_commencement`);
    }

    await fetchNormalized(transition.new_source_url);
  } catch (error) {
    failures.push(`${transition.id}: overgangskontroll feilet: ${error.message}`);
  }
}

if (failures.length) {
  console.error('\nFAIL-CLOSED: Minst én overvåket rettskilde, preaktiveringskandidat, dynamisk sats eller lovovergang må kontrolleres manuelt før berørte regler kan anses som ferske.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const activeCount = registry.rules.filter(r => r.status === 'active').length;
const candidateCount = registry.rules.filter(r => r.status === 'candidate').length;
const preactivationCount = preactivationRules.length;
const dynamicRateCount = (dynamicRates.rates ?? []).length;
console.log(`\nOK: ${activeCount} aktive runtime-regler, ${candidateCount} runtime-kandidat(er), ${preactivationCount} isolerte preaktiveringskandidat(er) i ${preactivationRegistries.length} registerfiler, ${dynamicRateCount} daterte satser og ${(transitions.transitions ?? []).length} lovovergang(er) er kontrollert.`);
