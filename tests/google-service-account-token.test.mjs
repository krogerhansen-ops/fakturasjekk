import assert from 'node:assert/strict';
import { createGoogleServiceAccountTokenProvider, GOOGLE_CLOUD_PLATFORM_SCOPE, GOOGLE_OAUTH_TOKEN_URI } from '../server/google-service-account-token.mjs';

const encoder = new TextEncoder();
function b64(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function b64urlDecode(value) {
  let text = value.replaceAll('-', '+').replaceAll('_', '/');
  while (text.length % 4) text += '=';
  const binary = atob(text);
  return new Uint8Array([...binary].map(char => char.charCodeAt(0)));
}
function pem(label, bytes) {
  const base64 = b64(new Uint8Array(bytes));
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----${['BEGIN', label].join(' ')}-----\n${lines.join('\n')}\n-----${['END', label].join(' ')}-----\n`;
}

const pair = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify']
);
const privatePkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
const privateKey = pem(['PRIVATE', 'KEY'].join(' '), privatePkcs8);

let tokenRequests = 0;
let assertionSeen = null;
const fetchImpl = async (url, options) => {
  tokenRequests += 1;
  assert.equal(url, GOOGLE_OAUTH_TOKEN_URI);
  assert.equal(options.method, 'POST');
  assert.equal(options.headers['content-type'], 'application/x-www-form-urlencoded');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.redirect, 'error');
  const form = new URLSearchParams(options.body);
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  assertionSeen = form.get('assertion');
  assert.ok(assertionSeen);
  return new Response(JSON.stringify({ access_token: 'short-lived-access-token', token_type: 'Bearer', expires_in: 3600 }), { status: 200 });
};

const clockDate = new Date('2026-08-19T07:30:00.000Z');
const provider = createGoogleServiceAccountTokenProvider({
  credentials: {
    client_email: 'fakturasjekk-ai@test-project.iam.gserviceaccount.com',
    private_key_id: 'key-id-test',
    private_key: privateKey,
    token_uri: GOOGLE_OAUTH_TOKEN_URI
  },
  fetchImpl,
  clock: () => new Date(clockDate)
});

assert.equal(await provider.getAccessToken(), 'short-lived-access-token');
assert.equal(await provider.getAccessToken(), 'short-lived-access-token');
assert.equal(tokenRequests, 1, 'valid Google OAuth access token should be cached');
assert.equal(provider.credential_type, 'service_account_key_fallback');
assert.equal(provider.scope, GOOGLE_CLOUD_PLATFORM_SCOPE);

const [encodedHeader, encodedClaims, encodedSignature] = assertionSeen.split('.');
const header = JSON.parse(new TextDecoder().decode(b64urlDecode(encodedHeader)));
const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(encodedClaims)));
assert.deepEqual(header, { alg: 'RS256', typ: 'JWT', kid: 'key-id-test' });
assert.equal(claims.iss, 'fakturasjekk-ai@test-project.iam.gserviceaccount.com');
assert.equal(claims.scope, GOOGLE_CLOUD_PLATFORM_SCOPE);
assert.equal(claims.aud, GOOGLE_OAUTH_TOKEN_URI);
assert.equal(claims.iat, Math.floor(clockDate.getTime() / 1000));
assert.equal(claims.exp - claims.iat, 3600);
assert.equal('sub' in claims, false, 'Fakturasjekk must not use domain-wide user delegation');

const signatureValid = await crypto.subtle.verify(
  'RSASSA-PKCS1-v1_5',
  pair.publicKey,
  b64urlDecode(encodedSignature),
  encoder.encode(`${encodedHeader}.${encodedClaims}`)
);
assert.equal(signatureValid, true, 'service-account JWT assertion must be signed with RS256');

clockDate.setMinutes(clockDate.getMinutes() + 61);
await provider.getAccessToken();
assert.equal(tokenRequests, 2, 'expired cached token must be refreshed');

assert.throws(() => createGoogleServiceAccountTokenProvider({
  credentials: { client_email: 'x@y.iam.gserviceaccount.com', private_key: privateKey, token_uri: 'https://evil.example/token' },
  fetchImpl
}), /official OAuth token endpoint/i);

const malformed = createGoogleServiceAccountTokenProvider({
  credentials: { client_email: 'x@y.iam.gserviceaccount.com', private_key: 'not-a-pem' }, fetchImpl
});
await assert.rejects(() => malformed.getAccessToken(), /PKCS#8 PEM|service-account private key/i);

console.log('OK Google service-account fallback issues a signed one-hour JWT assertion and caches short-lived access tokens');
