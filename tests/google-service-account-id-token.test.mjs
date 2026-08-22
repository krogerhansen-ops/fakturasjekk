import assert from 'node:assert/strict';
import { createGoogleServiceAccountIdTokenProvider, validateCloudRunAudience } from '../server/google-service-account-id-token.mjs';

const encoder = new TextEncoder();
const keyLabel = ['PRIVATE', 'KEY'].join(' ');
const pemBegin = `-----${['BEGIN', keyLabel].join(' ')}-----`;
const pemEnd = `-----${['END', keyLabel].join(' ')}-----`;
function b64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}
function jsonSegment(value) { return b64url(encoder.encode(JSON.stringify(value))); }
function decodeSegment(segment) {
  let value = segment.replaceAll('-', '+').replaceAll('_', '/');
  value += '='.repeat((4 - value.length % 4) % 4);
  return JSON.parse(atob(value));
}
function pem(bytes) {
  const raw = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const lines = raw.match(/.{1,64}/g).join('\n');
  return `${pemBegin}\n${lines}\n${pemEnd}\n`;
}

const pair = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify']
);
const privateKey = pem(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
const now = new Date('2026-08-22T11:00:00Z');
const audience = 'https://fakturasjekk-scanner-abc123-ew.a.run.app/';
let tokenRequests = 0;
let assertionClaims = null;
const fakeIdToken = `${jsonSegment({ alg: 'RS256', typ: 'JWT' })}.${jsonSegment({ aud: audience, exp: Math.floor(now.getTime() / 1000) + 3600 })}.signature`;

const fetchImpl = async (url, options) => {
  tokenRequests += 1;
  assert.equal(url, 'https://oauth2.googleapis.com/token');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers['content-type'], 'application/x-www-form-urlencoded');
  const form = new URLSearchParams(options.body);
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  const assertion = form.get('assertion');
  assert.equal(assertion.split('.').length, 3);
  assertionClaims = decodeSegment(assertion.split('.')[1]);
  return new Response(JSON.stringify({ id_token: fakeIdToken }), { status: 200 });
};

assert.equal(validateCloudRunAudience(audience), audience);
assert.equal(validateCloudRunAudience(audience.slice(0, -1)), audience);
assert.throws(() => validateCloudRunAudience('http://service.run.app/'), /clean HTTPS/i);
assert.throws(() => validateCloudRunAudience('https://scanner.example.com/'), /run\.app/i);
assert.throws(() => validateCloudRunAudience(`${audience}scan`), /service root/i);

const provider = createGoogleServiceAccountIdTokenProvider({
  credentials: {
    client_email: 'fakturasjekk-ai-runtime@example-project.iam.gserviceaccount.com',
    private_key: privateKey,
    private_key_id: 'synthetic-key-id',
    token_uri: 'https://oauth2.googleapis.com/token'
  },
  targetAudience: audience,
  fetchImpl,
  clock: () => now
});
assert.equal(provider.target_audience, audience);
assert.equal(await provider.getIdToken(), fakeIdToken);
assert.equal(await provider.getIdToken(), fakeIdToken);
assert.equal(tokenRequests, 1, 'valid ID token should be cached');
assert.equal(assertionClaims.iss, 'fakturasjekk-ai-runtime@example-project.iam.gserviceaccount.com');
assert.equal(assertionClaims.sub, assertionClaims.iss);
assert.equal(assertionClaims.aud, 'https://oauth2.googleapis.com/token');
assert.equal(assertionClaims.target_audience, audience);
assert.equal(assertionClaims.exp - assertionClaims.iat, 3600);

const badAudienceFetch = async () => new Response(JSON.stringify({
  id_token: `${jsonSegment({ alg: 'RS256' })}.${jsonSegment({ aud: 'https://other.run.app/', exp: Math.floor(now.getTime() / 1000) + 3600 })}.sig`
}), { status: 200 });
const badProvider = createGoogleServiceAccountIdTokenProvider({
  credentials: { client_email: 'runtime@example.iam.gserviceaccount.com', private_key: privateKey },
  targetAudience: audience,
  fetchImpl: badAudienceFetch,
  clock: () => now
});
await assert.rejects(() => badProvider.getIdToken(), /audience does not match/i);

console.log('OK Google service-account ID tokens are canonical-Cloud-Run-audience-bound, short-lived and cached without exposing credentials');
