import assert from 'node:assert/strict';
import {
  runSupabaseStorageLiveE2E,
  selectStorageE2EKey,
  STORAGE_E2E_PROJECT_REF,
  STORAGE_E2E_ORIGIN,
  STORAGE_E2E_BUCKET
} from '../scripts/verify-supabase-storage-live.mjs';

const SECRET = 'sb_secret_synthetic_storage_test';
const PDF = new TextEncoder().encode('%PDF-1.4\n% Fakturasjekk synthetic private Storage E2E\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

assert.equal(selectStorageE2EKey([
  { type: 'legacy', name: 'service_role', api_key: 'eyJ.legacy.test' },
  { type: 'secret', name: 'default', api_key: SECRET }
]), SECRET, 'modern sb_secret key must be preferred for Storage server calls');
assert.equal(selectStorageE2EKey([
  { type: 'legacy', name: 'service_role', api_key: 'eyJ.legacy.test' }
]), 'eyJ.legacy.test', 'legacy service_role remains a bounded fallback while supported');
assert.throws(() => selectStorageE2EKey([{ type: 'publishable', api_key: 'sb_publishable_test' }]), /server-only project key/i);

function createStorageFetch({ replaySucceeds = false } = {}) {
  const objects = new Map();
  const calls = [];
  let signedUploadCount = 0;

  const fetchImpl = async (url, options = {}) => {
    const target = new URL(String(url));
    const method = String(options.method ?? 'GET').toUpperCase();
    const headers = new Headers(options.headers ?? {});
    calls.push({ url: target.toString(), method, headers, body: options.body ?? null });

    if (target.toString() === `https://api.supabase.com/v1/projects/${STORAGE_E2E_PROJECT_REF}/api-keys?reveal=true`) {
      assert.equal(headers.get('authorization'), 'Bearer management-token');
      return json([{ type: 'secret', name: 'default', api_key: SECRET, disabled: false }]);
    }

    assert.equal(target.origin, STORAGE_E2E_ORIGIN);
    const prefix = '/storage/v1';
    const storagePath = target.pathname.startsWith(prefix) ? target.pathname.slice(prefix.length) : target.pathname;
    const signedPrefix = `/object/upload/sign/${STORAGE_E2E_BUCKET}/`;
    const objectPrefix = `/object/${STORAGE_E2E_BUCKET}/`;

    if (storagePath.startsWith(signedPrefix) && method === 'POST') {
      assert.equal(headers.get('apikey'), SECRET);
      assert.equal(headers.get('authorization'), null, 'modern secret key is apikey-only');
      const key = decodeURIComponent(storagePath.slice(signedPrefix.length)).split('/').map(decodeURIComponent).join('/');
      return json({ url: `/object/upload/sign/${STORAGE_E2E_BUCKET}/${key}?token=synthetic-signed-token` });
    }

    if (storagePath.startsWith(signedPrefix) && method === 'PUT') {
      assert.equal(headers.get('apikey'), null, 'signed browser upload must not receive the server secret');
      assert.equal(headers.get('authorization'), null, 'signed browser upload must not receive Authorization');
      assert.equal(headers.get('content-type'), 'application/pdf');
      assert.equal(headers.get('x-upsert'), 'false');
      const key = decodeURIComponent(storagePath.slice(signedPrefix.length)).split('/').map(decodeURIComponent).join('/');
      signedUploadCount += 1;
      if (signedUploadCount > 1 && !replaySucceeds) return json({ message: 'Asset Already Exists' }, 409);
      objects.set(key, { bytes: new Uint8Array(options.body), content_type: 'application/pdf' });
      return json({ Key: `${STORAGE_E2E_BUCKET}/${key}` });
    }

    if (storagePath.startsWith(objectPrefix)) {
      const key = storagePath.slice(objectPrefix.length).split('/').map(decodeURIComponent).join('/');
      const item = objects.get(key);

      if (method === 'GET' && headers.get('apikey') == null) {
        return json({ message: 'No API key found in request' }, 401);
      }

      assert.equal(headers.get('apikey'), SECRET);
      assert.equal(headers.get('authorization'), null);
      if (method === 'HEAD') {
        if (!item) return new Response(null, { status: 404 });
        return new Response(null, {
          status: 200,
          headers: {
            'content-length': String(item.bytes.byteLength),
            'content-type': item.content_type,
            etag: 'synthetic-etag'
          }
        });
      }
      if (method === 'GET') {
        if (!item) return new Response(null, { status: 404 });
        return new Response(item.bytes, { status: 200, headers: { 'content-type': item.content_type } });
      }
    }

    if (storagePath === `/object/list/${STORAGE_E2E_BUCKET}` && method === 'POST') {
      assert.equal(headers.get('apikey'), SECRET);
      const body = JSON.parse(String(options.body ?? '{}'));
      const folder = String(body.prefix ?? '').replace(/^\/+|\/+$/g, '');
      const rows = [];
      for (const [key, item] of objects.entries()) {
        const slash = key.lastIndexOf('/');
        const parent = slash >= 0 ? key.slice(0, slash) : '';
        const name = slash >= 0 ? key.slice(slash + 1) : key;
        if (parent === folder) rows.push({ id: `id:${key}`, name, metadata: { size: item.bytes.byteLength, mimetype: item.content_type } });
      }
      return json(rows);
    }

    if (storagePath === `/object/${STORAGE_E2E_BUCKET}` && method === 'DELETE') {
      assert.equal(headers.get('apikey'), SECRET);
      const body = JSON.parse(String(options.body ?? '{}'));
      for (const key of body.prefixes ?? []) objects.delete(key);
      return json((body.prefixes ?? []).map(name => ({ name })));
    }

    throw new Error(`Unexpected synthetic Storage request: ${method} ${target}`);
  };

  return { fetchImpl, calls, objects };
}

const live = createStorageFetch();
const result = await runSupabaseStorageLiveE2E({
  accessToken: 'management-token',
  projectRef: STORAGE_E2E_PROJECT_REF,
  fetchImpl: live.fetchImpl,
  clock: () => new Date('2026-08-22T09:30:00.000Z')
});
assert.equal(result.ok, true);
assert.equal(result.project_ref, STORAGE_E2E_PROJECT_REF);
assert.equal(result.bucket, STORAGE_E2E_BUCKET);
assert.equal(result.signed_upload_verified, true);
assert.equal(result.signed_replay_blocked, true);
assert.equal(result.unauthenticated_read_blocked, true);
assert.equal(result.private_read_verified, true);
assert.equal(result.sha256_integrity_verified, true);
assert.equal(result.magic_bytes_verified, true);
assert.equal(result.deletion_verified, true);
assert.equal(result.malware_scan_verified, false, 'Storage E2E must not pretend a malware provider was tested');
assert.equal(result.synthetic_only, true);
assert.equal(live.objects.size, 0, 'successful live verification must leave no synthetic Storage object behind');
assert.equal(JSON.stringify(result).includes(SECRET), false);
assert.equal(JSON.stringify(result).includes('synthetic-signed-token'), false);
assert.equal(live.calls.some(call => call.method === 'GET' && call.headers.get('apikey') == null && call.url.includes('/storage/v1/object/')), true, 'live verifier must prove unauthenticated object reads are rejected');

const replayFailure = createStorageFetch({ replaySucceeds: true });
await assert.rejects(
  runSupabaseStorageLiveE2E({
    accessToken: 'management-token',
    projectRef: STORAGE_E2E_PROJECT_REF,
    fetchImpl: replayFailure.fetchImpl
  }),
  /replay unexpectedly overwrote/i
);
assert.equal(replayFailure.objects.size, 0, 'failure after signed upload must still purge the synthetic object');
assert.equal(replayFailure.calls.some(call => call.method === 'DELETE'), true, 'failure cleanup must use the real provider deletion path');

await assert.rejects(
  runSupabaseStorageLiveE2E({ accessToken: 'management-token', projectRef: 'wrong-project', fetchImpl: live.fetchImpl }),
  /dedicated Fakturasjekk production project/i
);

console.log('OK live private Storage E2E verifier is project-locked, signed-upload-realistic, integrity-checking, private-read-safe and cleanup-safe');
