import assert from 'node:assert/strict';
import {
  createSupabaseServerRest,
  createSupabaseCaseStore,
  createSupabaseIdempotencyStore,
  createSupabasePaymentEventStore,
  createSupabaseAuditAdapter,
  createSupabaseAtomicCounterStore
} from '../server/supabase-data-adapters.mjs';

// HTTP boundary: new sb_secret keys are sent only as apikey, never as a Bearer token.
const httpCalls = [];
const rest = createSupabaseServerRest({
  supabaseUrl: 'https://jxmkaxwflouacuboaetg.supabase.co',
  secretKey: 'sb_secret_test_only',
  fetchImpl: async (url, options) => {
    httpCalls.push({ url, options });
    return new Response(JSON.stringify([{ ok: true }]), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
});
await rest.request('cases', { query: { id: 'eq.case-1' } });
assert.match(httpCalls[0].url, /^https:\/\/jxmkaxwflouacuboaetg\.supabase\.co\/rest\/v1\/cases\?/);
assert.equal(httpCalls[0].options.headers.apikey, 'sb_secret_test_only');
assert.equal('authorization' in httpCalls[0].options.headers, false);
assert.equal(httpCalls[0].options.cache, 'no-store');
assert.equal(httpCalls[0].options.redirect, 'error');

const calls = [];
let active = {
  id: 'case-1',
  owner_id: 'u1',
  state: 'draft',
  retention_mode: 'temporary',
  snapshot: {
    id: 'case-1', owner_id: 'u1', state: 'draft', retention_mode: 'temporary',
    intake_request: { subject: 'Sensitive invoice dispute', buyer_type: 'consumer' },
    documents: [{ id: 'doc-1', original_name: 'invoice.pdf' }],
    analyses: [{ result: 'sensitive analysis' }],
    created_at: '2026-08-18T12:00:00.000Z', updated_at: '2026-08-18T12:00:00.000Z'
  },
  created_at: '2026-08-18T12:00:00.000Z',
  updated_at: '2026-08-18T12:00:00.000Z',
  deleted_at: null
};
const fakeRest = {
  async request(path, options = {}) {
    calls.push({ path, options });
    if (path === 'cases' && options.method === 'POST') {
      active = { ...active, ...options.body, snapshot: structuredClone(options.body.snapshot) };
      return [structuredClone(active)];
    }
    if (path === 'cases' && options.method === 'PATCH') {
      active = { ...active, ...options.body, snapshot: structuredClone(options.body.snapshot) };
      return [structuredClone(active)];
    }
    if (path === 'cases' && !options.method) {
      if (options.query?.owner_id === 'eq.u2') return [];
      return [structuredClone(active)];
    }
    if (options.method === 'DELETE') return null;
    if (path === 'idempotency_keys' && !options.method) {
      return [{ state: 'completed', response: { ok: true }, expires_at: '2026-08-19T00:00:00.000Z', owner_id: 'u1', operation: 'create_case' }];
    }
    if (path === 'idempotency_keys' && options.method === 'POST') return null;
    if (path === 'rpc/fakturasjekk_claim_payment_event') return [{ status: 'conflict', existing_case_id: 'case-other' }];
    if (path === 'rpc/fakturasjekk_increment_rate_limit_window') return [{ count: 3, reset_at_ms: 1787090000000 }];
    if (path === 'audit_log' && options.method === 'POST') return null;
    throw new Error(`Unexpected fake REST call: ${path}`);
  }
};

const caseStore = createSupabaseCaseStore({ rest: fakeRest });
const saved = await caseStore.save({
  ...active.snapshot,
  analyses: [{ engine_version: '0.67.0' }],
  created_at: active.created_at,
  updated_at: active.updated_at,
  deleted_at: null
});
assert.equal(saved.id, 'case-1');
assert.equal(calls[0].options.query.on_conflict, 'id');
assert.match(calls[0].options.prefer, /resolution=merge-duplicates/);

assert.equal((await caseStore.getOwned('case-1', 'u1')).owner_id, 'u1');
await assert.rejects(() => caseStore.getOwned('case-1', 'u2'), /not found|owned/i);

calls.length = 0;
const deleted = await caseStore.deleteOwned('case-1', 'u1', { deleted_at: '2026-08-18T15:00:00.000Z' });
assert.equal(deleted.state, 'deleted');
assert.equal(deleted.deleted_at, '2026-08-18T15:00:00.000Z');
const deletePaths = calls.filter(call => call.options.method === 'DELETE').map(call => call.path);
assert.deepEqual(deletePaths, ['followups', 'supplier_responses', 'drafts', 'analyses', 'documents', 'case_events']);
assert.equal(JSON.stringify(deleted).includes('Sensitive invoice dispute'), false);
assert.equal(JSON.stringify(deleted).includes('invoice.pdf'), false);
assert.equal(JSON.stringify(deleted).includes('sensitive analysis'), false);

const idem = createSupabaseIdempotencyStore({ rest: fakeRest });
assert.deepEqual((await idem.get('u1:key')).response, { ok: true });
await idem.put('u1:key', { owner_id: 'u1', operation: 'create_case', state: 'completed', response: { ok: true }, expires_at: '2026-08-19T00:00:00.000Z' });

const payments = createSupabasePaymentEventStore({ rest: fakeRest });
assert.deepEqual(await payments.claim({ provider: 'vipps', provider_reference: 'ref-1', case_id: 'case-1' }), { status: 'conflict', existing_case_id: 'case-other' });

const counter = createSupabaseAtomicCounterStore({ rest: fakeRest });
assert.deepEqual(await counter.incrementWindow({ key: 'fakturasjekk:rl:read:u1', window_ms: 60000 }), { count: 3, reset_at: 1787090000000 });

const audit = createSupabaseAuditAdapter({ rest: fakeRest });
await audit.write({ actor_id: 'u1', case_id: 'case-1', action: 'case.test', outcome: 'success', metadata: { status: 'ok' }, at: '2026-08-18T15:00:00.000Z' });
const auditCall = calls.find(call => call.path === 'audit_log');
assert.equal(auditCall.options.body.metadata.status, 'ok');

assert.throws(() => createSupabaseServerRest({ supabaseUrl: 'http://jxmkaxwflouacuboaetg.supabase.co', secretKey: 'x' }), /HTTPS/i);
assert.throws(() => createSupabaseServerRest({ supabaseUrl: 'https://jxmkaxwflouacuboaetg.supabase.co', secretKey: '' }), /secret key/i);

console.log('OK Supabase server Data API adapters are service-only, atomic-RPC compatible and privacy-first on delete');
