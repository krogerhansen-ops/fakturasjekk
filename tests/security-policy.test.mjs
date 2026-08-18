import assert from 'node:assert/strict';
import { DEFAULT_SECURITY_POLICY, securityHeaders, validateOrigin, enforceRequestEnvelope, createMemoryRateLimiter } from '../server/security-policy.mjs';

const headers = securityHeaders({ production: true, sensitive: true });
assert.equal(headers['x-content-type-options'], 'nosniff');
assert.match(headers['cache-control'], /no-store/);
assert.ok(headers['strict-transport-security']);
assert.equal(validateOrigin('https://fakturasjekk.no', ['https://fakturasjekk.no']), true);
assert.equal(validateOrigin('https://evil.example', ['https://fakturasjekk.no']), false);

enforceRequestEnvelope({ method: 'POST', headers: { 'content-length': '100' } });
enforceRequestEnvelope({ method: 'DELETE', headers: {} });
assert.throws(() => enforceRequestEnvelope({ method: 'PATCH', headers: {} }), /ikke tillatt/i);
assert.throws(() => enforceRequestEnvelope({ method: 'POST', headers: { 'content-length': String(DEFAULT_SECURITY_POLICY.json_body_max_bytes + 1) } }), /for stor/i);
assert.equal(DEFAULT_SECURITY_POLICY.rate_limits.create_payment_session.max, 10);
assert.equal(DEFAULT_SECURITY_POLICY.rate_limits.payment_webhook.max, 60);

let now = 1000;
const limiter = createMemoryRateLimiter({ clock: () => now });
const rule = { window_ms: 1000, max: 2 };
assert.equal(limiter.check({ owner_id: 'u1', action: 'analyze', rule }).remaining, 1);
assert.equal(limiter.check({ owner_id: 'u1', action: 'analyze', rule }).remaining, 0);
assert.throws(() => limiter.check({ owner_id: 'u1', action: 'analyze', rule }), /for mange/i);
now = 3000;
assert.equal(limiter.check({ owner_id: 'u1', action: 'analyze', rule }).remaining, 1);

console.log('OK security policy');
