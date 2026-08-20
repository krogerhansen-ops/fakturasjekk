import fs from 'node:fs';
import assert from 'node:assert/strict';

const sheet = fs.readFileSync(new URL('../site/camera-test-sheet.html', import.meta.url), 'utf8');

assert.match(sheet, /SYNTETISK TEST – IKKE EKTE FAKTURA/);
assert.match(sheet, /Ingen ekte person- eller virksomhetsopplysninger/);
assert.match(sheet, /Dette dokumentet har ingen betalingsverdi/);
assert.match(sheet, /Alle navn, numre, beløp og adresser er oppdiktet/);
assert.match(sheet, /35 062,50 NOK/);
assert.match(sheet, /Mikrotekst for fokusprøve/);
assert.match(sheet, /window\.print\(\)/);
assert.match(sheet, /noindex,nofollow/);

for (const forbidden of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'supabase.co', 'googleapis.com', 'vipps']) {
  assert.equal(sheet.includes(forbidden), false, `synthetic camera sheet must remain local/static: ${forbidden}`);
}

console.log('OK printable camera test sheet is synthetic, static and suitable for safe mobile compatibility testing');
