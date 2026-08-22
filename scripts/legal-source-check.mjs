import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLegalRateRegistry } from '../engine/legal-rates.mjs';
import { discoverPreactivationRegistries } from './legal-candidate-discovery.mjs';

const rulesDir = fileURLToPath(new URL('../rules/', import.meta.url));
const registry = JSON.parse(fs.readFileSync(path.join(rulesDir, 'rules.json'), 'utf8'));
const transitions = JSON.parse(fs.readFileSync(path.join(rulesDir, 'transitions.json'), 'utf8'));
const rateRegistry = JSON.parse(fs.readFileSync(path.join(rulesDir, 'dynamic-rates.json'), 'utf8'));
const { registries: preactivationRegistries, rules: preactivationRules } = discoverPreactivationRegistries(rulesDir);

assertLegalRateRegistry(rateRegistry);

const runtimeMonitoredRules = registry.rules.filter(r => ['active', 'candidate'].includes(r.status));
const allIds = [...runtimeMonitoredRules, ...preactivationRules].map(rule => rule.id);
if (new Set(allIds).size !== allIds.length) {
  throw new Error('Duplicate legal rule id exists across runtime and preactivation registries.');
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

const sourceCache = new Map();
async function fetchNormalized(url) {
  if (sourceCache.has(url)) return sourceCache.get(url);
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'Fakturasjekk-LegalSourceWatch/0.32 (+https://fakturasjekk.no)' },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const normalized = normalizeHtml(await response.text());
  sourceCache.set(url, normalized);
  return normalized;
}

function expectedPhrase(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const failures = [];

for (const rule of monitoredRules) {
  try {
    const text = await fetchNormalized(rule.source_url);
    const expected = expectedPhrase(rule.expected_phrase);
    if (!text.includes(expected)) {
      failures.push(`${rule.id} (${rule.status}/${rule.registry_class}): kontrollfrasen finnes ikke lenger i kilden: "${rule.expected_phrase}"`);
    } else {
      console.log(`OK ${rule.id} · ${rule.status} · ${rule.registry_class} · ${rule.law} ${rule.section}`);
    }
  } catch (error) {
    failures.push(`${rule.id} (${rule.status}/${rule.registry_class}): kildekontroll feilet: ${error.message}`);
  }
}

for (const rate of rateRegistry.rates ?? []) {
  try {
    const text = await fetchNormalized(rate.source_url);
    const expected = expectedPhrase(rate.expected_phrase);
    if (!text.includes(expected)) {
      failures.push(`${rate.id} (controlled_rate): kontrollfrasen finnes ikke lenger i kilden: "${rate.expected_phrase}"`);
    } else {
      console.log(`OK ${rate.id} · controlled_rate · ${rate.effective_from}–${rate.effective_to}`);
    }
  } catch (error) {
    failures.push(`${rate.id} (controlled_rate): kildekontroll feilet: ${error.message}`);
  }
}

for (const transition of transitions.transitions ?? []) {
  if (transition.status !== 'awaiting_commencement') continue;
  try {
    const currentText = await fetchNormalized(transition.current_source_url);
    const pending = expectedPhrase(transition.expected_pending_phrase);
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
  console.error('\nFAIL-CLOSED: Minst én overvåket rettskilde, kontrollert sats, preaktiveringskandidat eller lovovergang må kontrolleres manuelt før berørte regler/satser kan anses som ferske.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const activeCount = registry.rules.filter(r => r.status === 'active').length;
const candidateCount = registry.rules.filter(r => r.status === 'candidate').length;
const preactivationCount = preactivationRules.length;
const rateCount = rateRegistry.rates?.length ?? 0;
console.log(`\nOK: ${activeCount} aktive runtime-regler, ${candidateCount} runtime-kandidat(er), ${preactivationCount} isolerte preaktiveringskandidat(er) i ${preactivationRegistries.length} registerfil(er), ${rateCount} kontrollerte satser og ${(transitions.transitions ?? []).length} lovovergang(er) er kontrollert.`);
