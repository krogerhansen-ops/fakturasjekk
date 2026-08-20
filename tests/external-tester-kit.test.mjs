import fs from 'node:fs';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../site/external-tester-feedback.html', import.meta.url), 'utf8');
const playbook = fs.readFileSync(new URL('../docs/EXTERNAL-TESTER-PLAYBOOK.md', import.meta.url), 'utf8');

assert.match(page, /Skjemaet lagrer eller sender ingenting/);
assert.match(page, /Ikke skriv personopplysninger eller bruk ekte fakturaer/);
assert.match(page, /29 kr for full sjekk \+ kontrollert innsigelsesutkast/);
assert.match(page, /navigator\.clipboard\.writeText/);
assert.match(page, /Ingen testdata sendes automatisk/);
assert.match(page, /noindex,nofollow/);

for (const forbidden of [
  'fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'form action=',
  'supabase.co', 'googleapis.com', 'vipps', 'mailto:', 'name="email"', 'type="email"'
]) {
  assert.equal(page.includes(forbidden), false, `tester feedback page must remain local-only and non-identifying: ${forbidden}`);
}

assert.match(playbook, /QA_EXTERNAL_TESTERS.*skal \*\*ikke\*\* markeres complete/);
assert.match(playbook, /minst tre reelle eksterne testere/);
assert.match(playbook, /iPhone \/ Safari/);
assert.match(playbook, /Android \/ Chrome/);
assert.match(playbook, /ikke en ekte faktura/i);
assert.match(playbook, /29 kr/);
assert.match(playbook, /kritisk feil/i);
assert.match(playbook, /camera-local-test\.html/);
assert.match(playbook, /camera-test-sheet\.html/);
assert.match(playbook, /external-tester-feedback\.html/);

console.log('OK external tester kit is structured, zero-cost, non-identifying and cannot close QA gate without real external tests');
