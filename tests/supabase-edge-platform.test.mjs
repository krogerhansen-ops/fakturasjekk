import assert from 'node:assert/strict';
import { loadSupabaseEdgeSecrets, createSupabaseEdgePlatformAdapters, SUPABASE_EDGE_PROJECT } from '../server/supabase-edge-platform.mjs';

const env = {
  SUPABASE_URL: 'https://jxmkaxwflouacuboaetg.supabase.co',
  SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_test_only' }),
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_test_only' })
};
const secrets = loadSupabaseEdgeSecrets(env);
assert.equal(secrets.supabaseUrl, SUPABASE_EDGE_PROJECT.origin);
assert.equal(secrets.publishableKey, 'sb_publishable_test_only');
assert.equal(secrets.secretKey, 'sb_secret_test_only');
assert.equal(SUPABASE_EDGE_PROJECT.private_storage_bucket, 'case-documents-private');
assert.equal(SUPABASE_EDGE_PROJECT.storage_requires_explicit_malware_scanner, true);

const fetchStub = async () => new Response('[]', { status: 200 });
const adapters = createSupabaseEdgePlatformAdapters({ ...secrets, fetchImpl: fetchStub });
for (const [name, method] of [
  ['caseStore', 'getOwned'],
  ['idempotencyStore', 'put'],
  ['paymentEventStore', 'claim'],
  ['auditAdapter', 'write'],
  ['rateLimiter', 'check'],
  ['authAdapter', 'verifyBearer'],
  ['storageProvider', 'createSignedPut']
]) {
  assert.equal(typeof adapters[name]?.[method], 'function', `missing ${name}.${method}`);
}
assert.equal(adapters.storage, null, 'raw Storage provider must not become upload-capable app storage without malware scanner');
assert.equal(JSON.stringify(adapters).includes('sb_secret_test_only'), false, 'secret key must not be exposed as adapter metadata');

const securedAdapters = createSupabaseEdgePlatformAdapters({
  ...secrets,
  malwareScanner: { async scanBytes() { return { safe: true, engine: 'synthetic-av', version: '1.0' }; } },
  fetchImpl: fetchStub
});
assert.equal(typeof securedAdapters.storage?.reservePrivateObject, 'function');
assert.equal(typeof securedAdapters.storage?.finalizeUpload, 'function');
assert.notEqual(securedAdapters.storage, securedAdapters.storageProvider, 'application storage must wrap the raw provider with scanner enforcement');

assert.throws(() => createSupabaseEdgePlatformAdapters({
  ...secrets,
  malwareScanner: {},
  fetchImpl: fetchStub
}), /explicit malware scanner/i);

const singular = loadSupabaseEdgeSecrets({
  SUPABASE_URL: SUPABASE_EDGE_PROJECT.origin,
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local',
  SUPABASE_SECRET_KEY: 'sb_secret_local'
});
assert.equal(singular.publishableKey, 'sb_publishable_local');
assert.equal(singular.secretKey, 'sb_secret_local');

assert.throws(() => loadSupabaseEdgeSecrets({ ...env, SUPABASE_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co' }), /dedicated Fakturasjekk/i);
assert.throws(() => loadSupabaseEdgeSecrets({ ...env, SUPABASE_PUBLISHABLE_KEYS: '{}' }), /publishable key/i);
assert.throws(() => loadSupabaseEdgeSecrets({ ...env, SUPABASE_SECRET_KEYS: '{}' }), /secret key/i);
assert.throws(() => loadSupabaseEdgeSecrets({ ...env, SUPABASE_SECRET_KEYS: 'not-json' }), /valid JSON/i);
assert.throws(() => createSupabaseEdgePlatformAdapters({ ...secrets, supabaseUrl: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co' }), /dedicated Fakturasjekk/i);

console.log('OK Supabase Edge platform exposes raw private provider but composes upload-capable storage only with explicit malware scanning');
