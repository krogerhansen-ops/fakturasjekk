import fs from 'node:fs';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../site/camera-local-test.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../site/app/camera-local-test-page.mjs', import.meta.url), 'utf8');

assert.match(page, /type="file" accept="image\/\*" capture="environment"/);
assert.match(page, /Bildet forlater ikke enheten din/);
assert.match(page, /Ingen fil lastes opp/);
assert.match(page, /Nettleserpolicyen blokkerer også utgående nettverkskall/);
assert.match(page, /helst en ufarlig testside – ikke en ekte faktura/);
assert.match(page, /Produksjonsflyten er fortsatt sperret/);
assert.match(page, /meta name="robots" content="noindex,nofollow"/);
assert.match(page, /meta name="referrer" content="no-referrer"/);
assert.match(page, /Content-Security-Policy/);
assert.match(page, /connect-src 'none'/);
assert.match(page, /script-src 'self'/);
assert.match(page, /form-action 'none'/);
assert.match(page, /src="\.\/app\/camera-local-test-page\.mjs"/);
assert.equal(/<script[^>]*>(?!\s*<\/script>)[\s\S]*?<\/script>/i.test(page), false, 'camera page must not use inline JavaScript under strict CSP');

assert.match(script, /createBrowserCameraSanitizer/);
assert.match(script, /createBrowserCameraQualityAssessor/);
assert.match(script, /Ingen opplasting er utført/);
assert.equal(script.includes('file.name'), false, 'local technical diagnostics should not repeat the original filename');

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
  assert.equal(script.includes(forbidden), false, `Local camera test script must not contain network/upload primitive: ${forbidden}`);
}

const urls = [...`${page}\n${script}`.matchAll(/https?:\/\/[^\s"'<)]+/g)].map(match => match[0]);
assert.deepEqual(urls, [], 'local camera compatibility test must not depend on external URLs');

const launchPage = fs.readFileSync(new URL('../site/index-launch-candidate.html', import.meta.url), 'utf8');
assert.equal(/type=["']file["']/i.test(launchPage), false, 'main public launch candidate must still have no real file input');
assert.equal(launchPage.includes('camera-local-test.html'), false, 'local camera test must remain an unlinked specialist test route, not a customer CTA');

console.log('OK local camera test is CSP-locked, filename-minimized and has no upload/network access');
