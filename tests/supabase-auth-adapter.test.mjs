import assert from 'node:assert/strict';
import { createSupabaseAuthAdapter } from '../server/supabase-auth-adapter.mjs';

const requests = [];
const adapter = createSupabaseAuthAdapter({
  supabaseUrl: 'https://jxmkaxwflouacuboaetg.supabase.co',
  publishableKey: 'sb_publishable_test_only',
  fetchImpl: async (url, options) => {
    requests.push({ url, options });
    if (options.headers.authorization === 'Bearer valid-jwt') {
      return new Response(JSON.stringify({ id: 'user-123', email: 'should-not-be-returned@example.no', user_metadata: { role: 'user-editable' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ message: 'invalid token' }), { status: 401 });
  }
});

assert.deepEqual(await adapter.verifyBearer('valid-jwt'), { id: 'user-123' });
assert.equal(await adapter.verifyBearer('invalid-jwt'), null);
assert.equal(await adapter.verifyBearer(''), null);
assert.equal(requests[0].url, 'https://jxmkaxwflouacuboaetg.supabase.co/auth/v1/user');
assert.equal(requests[0].options.method, 'GET');
assert.equal(requests[0].options.headers.apikey, 'sb_publishable_test_only');
assert.equal(requests[0].options.headers.authorization, 'Bearer valid-jwt');
assert.equal(requests[0].options.cache, 'no-store');
assert.equal(requests[0].options.redirect, 'error');

const failingNetwork = createSupabaseAuthAdapter({
  supabaseUrl: 'https://jxmkaxwflouacuboaetg.supabase.co',
  publishableKey: 'sb_publishable_test_only',
  fetchImpl: async () => { throw new Error('network unavailable'); }
});
assert.equal(await failingNetwork.verifyBearer('anything'), null, 'auth must fail closed on network errors');

assert.throws(() => createSupabaseAuthAdapter({ supabaseUrl: 'http://jxmkaxwflouacuboaetg.supabase.co', publishableKey: 'x' }), /HTTPS/i);
assert.throws(() => createSupabaseAuthAdapter({ supabaseUrl: 'https://jxmkaxwflouacuboaetg.supabase.co', publishableKey: '' }), /publishable key/i);

console.log('OK Supabase Auth adapter validates remotely and returns only minimal user id');
