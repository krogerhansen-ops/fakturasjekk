import fs from 'node:fs';
import assert from 'node:assert/strict';

const build = fs.readFileSync(new URL('../scripts/build-cloudflare-pages.mjs', import.meta.url), 'utf8');
const headers = fs.readFileSync(new URL('../cloudflare/_headers', import.meta.url), 'utf8');

for (const expected of [
  'site/index-launch-candidate.html',
  'engine/analyzer.mjs',
  'engine/draft.mjs',
  'rules/rules.json',
  'data/demo-cases.json',
  'config/product.json',
  'cloudflare/_headers'
]) assert.ok(build.includes(expected), `Cloudflare allowlist missing ${expected}`);

for (const forbidden of ['server', 'admin', 'supabase', '.env', 'VIPPS_CLIENT_SECRET', 'SUPABASE_SECRET_KEY']) {
  assert.ok(build.includes(forbidden), `Cloudflare build must explicitly guard ${forbidden}`);
}

assert.match(headers, /X-Content-Type-Options: nosniff/);
assert.match(headers, /X-Frame-Options: DENY/);
assert.match(headers, /Referrer-Policy: no-referrer/);
assert.match(headers, /Content-Security-Policy:/);
assert.match(headers, /frame-ancestors 'none'/);
assert.match(headers, /object-src 'none'/);
assert.match(headers, /connect-src 'self'/);

console.log('OK Cloudflare build is allowlisted, secret-scanned and security-headered');
