import assert from 'node:assert/strict';
import { validateVerifiedClaims, createJwtAuthAdapter, createDevelopmentJwtVerifier } from '../server/jwt-auth-contract.mjs';

const clock = () => new Date('2026-08-18T14:00:00Z');
const now = Math.floor(clock().getTime() / 1000);
const issuer = 'https://auth.fakturasjekk.no';
const audience = 'fakturasjekk-api';
const validClaims = { sub: 'u1', iss: issuer, aud: audience, exp: now + 3600, iat: now - 10, email: 'u1@example.no' };
assert.equal(validateVerifiedClaims(validClaims, { issuer, audience, clock }).valid, true);
assert.equal(validateVerifiedClaims({ ...validClaims, iss: 'https://evil.example' }, { issuer, audience, clock }).valid, false);
assert.equal(validateVerifiedClaims({ ...validClaims, aud: ['other'] }, { issuer, audience, clock }).valid, false);
assert.equal(validateVerifiedClaims({ ...validClaims, exp: now - 1000 }, { issuer, audience, clock, clock_skew_seconds: 0 }).valid, false);
assert.equal(validateVerifiedClaims({ ...validClaims, nbf: now + 1000 }, { issuer, audience, clock, clock_skew_seconds: 0 }).valid, false);

const token = 'this-is-a-long-test-token-value';
const verifier = createDevelopmentJwtVerifier({ claimsByToken: { [token]: validClaims } });
const adapter = createJwtAuthAdapter({ verifier, issuer, audience, clock });
const user = await adapter.verifyBearer(token);
assert.equal(user.id, 'u1');
assert.equal(user.email, 'u1@example.no');
assert.equal(await adapter.verifyBearer('invalid-long-token-value'), null);

const badSig = createJwtAuthAdapter({ verifier: { async verify() { return { signature_valid: false, claims: validClaims }; } }, issuer, audience, clock });
assert.equal(await badSig.verifyBearer(token), null);

console.log('OK verified JWT auth contract');
