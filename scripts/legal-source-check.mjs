import fs from 'node:fs';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));
const transitions = JSON.parse(fs.readFileSync(new URL('../rules/transitions.json', import.meta.url), 'utf8'));
const monitoredRules = registry.rules.filter(r => ['active', 'candidate'].includes(r.status));

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
    headers: { 'user-agent': 'Fakturasjekk-LegalSourceWatch/0.29 (+https://fakturasjekk.no)' },
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
      failures.push(`${rule.id} (${rule.status}): kontrollfrasen finnes ikke lenger i kilden: "${rule.expected_phrase}"`);
    } else {
      console.log(`OK ${rule.id} · ${rule.status} · ${rule.law} ${rule.section}`);
    }
  } catch (error) {
    failures.push(`${rule.id} (${rule.status}): kildekontroll feilet: ${error.message}`);
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
  console.error('\nFAIL-CLOSED: Minst én overvåket rettskilde eller lovovergang må kontrolleres manuelt før berørte regler kan anses som ferske.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const activeCount = registry.rules.filter(r => r.status === 'active').length;
const candidateCount = registry.rules.filter(r => r.status === 'candidate').length;
console.log(`\nOK: ${activeCount} aktive regler, ${candidateCount} kandidatregel/-regler og ${(transitions.transitions ?? []).length} lovovergang(er) er kontrollert.`);
