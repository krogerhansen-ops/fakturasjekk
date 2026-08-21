import fs from 'node:fs';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../site/tester-start.html', import.meta.url), 'utf8');

assert.match(page, /Ikke bruk ekte fakturaer eller personopplysninger/);
assert.match(page, /index-launch-candidate\.html#demo/);
assert.match(page, /camera-test-sheet\.html/);
assert.match(page, /camera-local-test\.html/);
assert.match(page, /external-tester-feedback\.html/);
assert.match(page, /Bildet skal ikke lastes opp/);
assert.match(page, /kritisk feil/);
assert.match(page, /noindex,nofollow/);
assert.match(page, /meta name="referrer" content="no-referrer"/);
assert.match(page, /Content-Security-Policy/);
assert.match(page, /script-src 'none'/);
assert.match(page, /connect-src 'none'/);
assert.match(page, /form-action 'none'/);

for (const forbidden of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'https://', 'http://', '<script']) {
  assert.equal(page.includes(forbidden), false, `tester start page must only navigate to same-origin static routes: ${forbidden}`);
}

console.log('OK external tester start page is CSP-locked and provides one safe same-origin entry point without data submission');
