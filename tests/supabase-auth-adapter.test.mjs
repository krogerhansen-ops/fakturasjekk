import assert from 'node:assert/strict';
import { createSupabaseAuthAdapter, SUPABASE_AUTH_POLICY } from '../server/supabase-auth-adapter.mjs';

const permanentId = '11111111-1111-4111-8111-111111111111';
const anonymousId = '22222222-2222-4222-8222-222222222222';
const requests = [];
const adapter = createSupabaseAuthAdapter({
  supabaseUrl: 'https://jxmkaxwflouacuboaetg.supabase.co',
  publishableKey: 'sb_publishable_test_only',
  fetchImpl: async (url, options) => {
    requests.push({ url, options });
    const bearer = options.headers.authorization;
    if (bearer === 'Bearer valid-jwt') {
      return new Response(JSON.stringify({
        id: permanentId,
        role: 'authenticated',
        is_anonymous: false,
        email: 'Verified.User@Example.NO',
        email_confirmed_at: '2026-08-22T09:00:00.000Z',
        phone: '+4712345678',
        user_metadata: { role: 'user-editable', display_name: 'Must not escape auth adapter' }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (bearer === 'Bearer unconfirmed-email-jwt') {
      return new Response(JSON.stringify({
        id: permanentId, role: 'authenticated', is_anonymous: false,
        email: 'unconfirmed@example.no', email_confirmed_at: null
      }), { status: 200 });
    }
    if (bearer === 'Bearer other-user-email-jwt') {
      return new Response(JSON.stringify({
        id: '33333333-3333-4333-8333-333333333333', role: 'authenticated', is_anonymous: false,
        email: 'other@example.no', email_confirmed_at: '2026-08-22T09:00:00.000Z'
      }), { status: 200 });
    }
    if (bearer === 'Bearer anonymous-jwt') {
      return new Response(JSON.stringify({ id: anonymousId, role: 'authenticated', is_anonymous: true }), { status: 200 });
    }
    if (bearer === 'Bearer wrong-role-jwt') {
      return new Response(JSON.stringify({ id: permanentId, role: 'service_role', is_anonymous: false }), { status: 200 });
    }
    if (bearer === 'Bearer malformed-user-jwt') {
      return new Response(JSON.stringify({ id: 'not-a-uuid', role: 'authenticated', is_anonymous: false }), { status: 200 });
    }
    if (bearer === 'Bearer missing-anonymous-claim') {
      return new Response(JSON.stringify({ id: permanentId, role: 'authenticated' }), { status: 200 });
    }
    if (bearer === 'Bearer invalid-json') return new Response('not-json', { status: 200 });
    return new Response(JSON.stringify({ message: 'invalid token' }), { status: 401 });
  }
});

assert.deepEqual(await adapter.verifyBearer('valid-jwt'), { id: permanentId }, 'authorization identity must remain UUID-only');
const delivery = await adapter.getVerifiedDeliveryContact('valid-jwt', permanentId);
assert.deepEqual(delivery, {
  user_id: permanentId,
  email: 'verified.user@example.no',
  verified_at: '2026-08-22T09:00:00.000Z'
});
assert.equal(JSON.stringify(delivery).includes('+4712345678'), false);
assert.equal(JSON.stringify(delivery).includes('display_name'), false);
assert.equal(await adapter.getVerifiedDeliveryContact('unconfirmed-email-jwt', permanentId), null, 'unconfirmed email must not receive paid order confirmation');
assert.equal(await adapter.getVerifiedDeliveryContact('other-user-email-jwt', permanentId), null, 'delivery lookup must not resolve another account');
assert.equal(await adapter.getVerifiedDeliveryContact('valid-jwt', 'not-a-uuid'), null);

assert.equal(await adapter.verifyBearer('anonymous-jwt'), null, 'anonymous Auth user must not own paid/stored customer cases');
assert.equal(await adapter.verifyBearer('wrong-role-jwt'), null);
assert.equal(await adapter.verifyBearer('malformed-user-jwt'), null);
assert.equal(await adapter.verifyBearer('missing-anonymous-claim'), null, 'missing permanent-user proof must fail closed');
assert.equal(await adapter.verifyBearer('invalid-json'), null);
assert.equal(await adapter.verifyBearer('invalid-jwt'), null);
assert.equal(await adapter.verifyBearer(''), null);
assert.equal(await adapter.verifyBearer('contains whitespace'), null);

const beforeOversize = requests.length;
assert.equal(await adapter.verifyBearer('x'.repeat(SUPABASE_AUTH_POLICY.max_bearer_bytes + 1)), null);
assert.equal(requests.length, beforeOversize, 'oversized bearer must be rejected before provider request');

assert.equal(requests[0].url, 'https://jxmkaxwflouacuboaetg.supabase.co/auth/v1/user');
assert.equal(requests[0].options.method, 'GET');
assert.equal(requests[0].options.headers.apikey, 'sb_publishable_test_only');
assert.equal(requests[0].options.headers.authorization, 'Bearer valid-jwt');
assert.equal(requests[0].options.cache, 'no-store');
assert.equal(requests[0].options.redirect, 'error');
assert.equal(SUPABASE_AUTH_POLICY.require_permanent_user, true);
assert.equal(SUPABASE_AUTH_POLICY.require_confirmed_delivery_email, true);
assert.equal(SUPABASE_AUTH_POLICY.project_ref, 'jxmkaxwflouacuboaetg');

const failingNetwork = createSupabaseAuthAdapter({
  supabaseUrl: 'https://jxmkaxwflouacuboaetg.supabase.co',
  publishableKey: 'sb_publishable_test_only',
  fetchImpl: async () => { throw new Error('network unavailable'); }
});
assert.equal(await failingNetwork.verifyBearer('anything'), null, 'auth must fail closed on network errors');
assert.equal(await failingNetwork.getVerifiedDeliveryContact('anything', permanentId), null, 'delivery contact lookup must fail closed on network errors');

assert.throws(() => createSupabaseAuthAdapter({ supabaseUrl: 'http://jxmkaxwflouacuboaetg.supabase.co', publishableKey: 'sb_publishable_x' }), /HTTPS/i);
assert.throws(() => createSupabaseAuthAdapter({ supabaseUrl: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co', publishableKey: 'sb_publishable_x' }), /dedicated Fakturasjekk/i);
assert.throws(() => createSupabaseAuthAdapter({ supabaseUrl: 'https://jxmkaxwflouacuboaetg.supabase.co', publishableKey: '' }), /publishable/i);
assert.throws(() => createSupabaseAuthAdapter({ supabaseUrl: 'https://jxmkaxwflouacuboaetg.supabase.co', publishableKey: 'sb_secret_must_never_be_client_auth_key' }), /secret keys are forbidden/i);
assert.throws(() => createSupabaseAuthAdapter({ supabaseUrl: 'https://jxmkaxwflouacuboaetg.supabase.co', publishableKey: 'plain-text-key' }), /valid Supabase/i);

console.log('OK Supabase Auth remains UUID-only for authorization and exposes confirmed email only through the checkout delivery-contact boundary');
