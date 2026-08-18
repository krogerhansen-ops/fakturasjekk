import assert from 'node:assert/strict';
import { createFetchHandler } from '../server/fetch-runtime.mjs';
import { createMemoryRateLimiter } from '../server/security-policy.mjs';

const calls = [];
const api = {
  async invoke(action, request) {
    calls.push({ action, request });
    return { status: 200, body: { ok: true, action, user_id: request.auth?.user?.id ?? null, raw: request.raw_body ?? null } };
  }
};
const authAdapter = {
  async verifyBearer(token) {
    return token === 'good-token' ? { id: 'user-1' } : null;
  }
};
const rateLimiter = createMemoryRateLimiter();
const handler = createFetchHandler({
  api,
  authAdapter,
  allowedOrigins: ['https://fakturasjekk.no'],
  rateLimiter,
  production: true,
  basePath: '/functions/v1/fakturasjekk-api'
});

const health = await handler(new Request('https://jxmkaxwflouacuboaetg.supabase.co/functions/v1/fakturasjekk-api/health'));
assert.equal(health.status, 200);
assert.equal(health.headers.get('x-frame-options'), 'DENY');
assert.equal(health.headers.get('content-security-policy'), "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'");
assert.equal((await health.json()).action, 'health');

const create = await handler(new Request('https://jxmkaxwflouacuboaetg.supabase.co/functions/v1/fakturasjekk-api/v1/cases?source=web', {
  method: 'POST',
  headers: {
    authorization: 'Bearer good-token',
    origin: 'https://fakturasjekk.no',
    'content-type': 'application/json',
    'idempotency-key': 'idem-1'
  },
  body: JSON.stringify({ buyer_type: 'consumer' })
}));
assert.equal(create.status, 200);
assert.equal(create.headers.get('access-control-allow-origin'), 'https://fakturasjekk.no');
const createBody = await create.json();
assert.equal(createBody.user_id, 'user-1');
assert.equal(calls.at(-1).request.query.source, 'web');
assert.deepEqual(calls.at(-1).request.body, { buyer_type: 'consumer' });

const preflight = await handler(new Request('https://jxmkaxwflouacuboaetg.supabase.co/functions/v1/fakturasjekk-api/v1/cases', {
  method: 'OPTIONS',
  headers: {
    origin: 'https://fakturasjekk.no',
    'access-control-request-method': 'POST'
  }
}));
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://fakturasjekk.no');
assert.match(preflight.headers.get('access-control-allow-methods'), /POST/);

const badOrigin = await handler(new Request('https://jxmkaxwflouacuboaetg.supabase.co/functions/v1/fakturasjekk-api/v1/cases', {
  method: 'POST',
  headers: {
    authorization: 'Bearer good-token',
    origin: 'https://evil.example',
    'content-type': 'application/json'
  },
  body: '{}'
}));
assert.equal(badOrigin.status, 403);
assert.equal(badOrigin.headers.get('access-control-allow-origin'), null);

const badToken = await handler(new Request('https://jxmkaxwflouacuboaetg.supabase.co/functions/v1/fakturasjekk-api/v1/cases', {
  method: 'POST',
  headers: {
    authorization: 'Bearer bad-token',
    origin: 'https://fakturasjekk.no',
    'content-type': 'application/json'
  },
  body: '{}'
}));
assert.equal(badToken.status, 401);

const webhookPayload = '{"event":"paid","signature_material":"raw"}';
const webhook = await handler(new Request('https://jxmkaxwflouacuboaetg.supabase.co/functions/v1/fakturasjekk-api/v1/webhooks/payment/provider-x', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: webhookPayload
}));
assert.equal(webhook.status, 200);
assert.equal((await webhook.json()).raw, webhookPayload);

const missing = await handler(new Request('https://jxmkaxwflouacuboaetg.supabase.co/functions/v1/fakturasjekk-api/not-a-route'));
assert.equal(missing.status, 404);

console.log('OK Web Fetch runtime preserves routes, auth, CORS, raw webhooks and security headers');
