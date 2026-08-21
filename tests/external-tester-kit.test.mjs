import fs from 'node:fs';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../site/external-tester-feedback.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../site/app/external-tester-feedback-page.mjs', import.meta.url), 'utf8');
const playbook = fs.readFileSync(new URL('../docs/EXTERNAL-TESTER-PLAYBOOK.md', import.meta.url), 'utf8');

assert.match(page, /Skjemaet lagrer eller sender ingenting/);
assert.match(page, /Ikke skriv personopplysninger eller bruk ekte fakturaer/);
assert.match(page, /29 kr for full sjekk \+ kontrollert innsigelsesutkast/);
assert.match(page, /Ingen testdata sendes automatisk/);
assert.match(page, /noindex,nofollow/);
assert.match(page, /meta name="referrer" content="no-referrer"/);
assert.match(page, /Content-Security-Policy/);
assert.match(page, /connect-src 'none'/);
assert.match(page, /form-action 'none'/);
assert.match(page, /script-src 'self'/);
assert.match(page, /src="\.\/app\/external-tester-feedback-page\.mjs"/);
assert.equal(/<script[^>]*>(?!\s*<\/script>)[\s\S]*?<\/script>/i.test(page), false, 'feedback page must not contain inline JavaScript');
assert.match(script, /navigator\.clipboard\.writeText/);

for (const forbidden of [
  'fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'form action=',
  'supabase.co', 'googleapis.com', 'vipps', 'mailto:', 'name="email"', 'type="email"'
]) {
  assert.equal(page.includes(forbidden), false, `tester feedback page must remain local-only and non-identifying: ${forbidden}`);
  assert.equal(script.includes(forbidden), false, `tester feedback script must remain local-only and non-identifying: ${forbidden}`);
}

assert.match(playbook, /QA_EXTERNAL_TESTERS.*skal \*\*ikke\*\* markeres complete/);
assert.match(playbook, /minst tre reelle eksterne testere/);
assert.match(playbook, /iPhone \/ Safari/);
assert.match(playbook, /Android \/ Chrome/);
assert.match(playbook, /Ikke bruk ekte faktura/i);
assert.match(playbook, /29 kr/);
assert.match(playbook, /kritisk feil/i);
assert.match(playbook, /camera-local-test\.html/);
assert.match(playbook, /camera-test-sheet\.html/);
assert.match(playbook, /external-tester-feedback\.html/);

console.log('OK external tester kit is CSP-locked, zero-cost, non-identifying and cannot close QA gate without real external tests');
