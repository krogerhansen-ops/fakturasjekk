import fs from 'node:fs';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));

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

const failures = [];
for (const rule of registry.rules.filter(r => r.status === 'active')) {
  try {
    const response = await fetch(rule.source_url, {
      redirect: 'follow',
      headers: { 'user-agent': 'Fakturasjekk-LegalSourceWatch/0.21 (+https://fakturasjekk.no)' },
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
      failures.push(`${rule.id}: HTTP ${response.status} fra ${rule.source_url}`);
      continue;
    }

    const text = normalizeHtml(await response.text());
    const expected = rule.expected_phrase.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!text.includes(expected)) {
      failures.push(`${rule.id}: kontrollfrasen finnes ikke lenger i kilden: "${rule.expected_phrase}"`);
    } else {
      console.log(`OK ${rule.id} · ${rule.law} ${rule.section}`);
    }
  } catch (error) {
    failures.push(`${rule.id}: kildekontroll feilet: ${error.message}`);
  }
}

if (failures.length) {
  console.error('\nFAIL-CLOSED: Minst én aktiv rettskilde må kontrolleres manuelt før regelen kan anses som fersk.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`\nOK: ${registry.rules.filter(r => r.status === 'active').length} aktive rettskilder svarte og inneholdt forventet kontrollfrase.`);
