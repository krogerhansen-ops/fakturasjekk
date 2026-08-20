import fs from 'node:fs';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../site/camera-local-test.html', import.meta.url), 'utf8');

assert.match(page, /type="file" accept="image\/\*" capture="environment"/);
assert.match(page, /Bildet forlater ikke enheten din/);
assert.match(page, /Ingen fil lastes opp/);
assert.match(page, /createBrowserCameraSanitizer/);
assert.match(page, /createBrowserCameraQualityAssessor/);
assert.match(page, /Ingen opplasting er utført/);
assert.match(page, /helst en ufarlig testside – ikke en ekte faktura/);
assert.match(page, /Produksjonsflyten er fortsatt sperret/);
assert.match(page, /meta name="robots" content="noindex,nofollow"/);

for (const forbidden of [
  'fetch(',
  'XMLHttpRequest',
  'WebSocket',
  'sendBeacon',
  'registerUploads',
  'uploadSigned',
  'confirmDocument',
  'supabase.co',
  'googleapis.com',
  'vipps',
  'analytics',
  'gtag('
]) {
  assert.equal(page.includes(forbidden), false, `Local camera test page must not contain network/upload primitive: ${forbidden}`);
}

const urls = [...page.matchAll(/https?:\/\/[^\s"'<)]+/g)].map(match => match[0]);
assert.deepEqual(urls, [], 'local camera compatibility test must not depend on external URLs');

const launchPage = fs.readFileSync(new URL('../site/index-launch-candidate.html', import.meta.url), 'utf8');
assert.equal(/type=["']file["']/i.test(launchPage), false, 'main public launch candidate must still have no real file input');
assert.equal(launchPage.includes('camera-local-test.html'), false, 'local camera test must remain an unlinked specialist test route, not a customer CTA');

console.log('OK local camera test page can exercise browser primitives without upload/network access or changing the customer launch page');
