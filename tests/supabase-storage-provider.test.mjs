import assert from 'node:assert/strict';
import { createSupabaseStorageProvider, normalizeStorageKey, SUPABASE_STORAGE_PROVIDER } from '../server/supabase-storage-provider.mjs';
import { createPrivateObjectStorageAdapter } from '../server/private-storage-adapter.mjs';

const origin = SUPABASE_STORAGE_PROVIDER.origin;
const bucket = 'case-documents-private';
const secret = 'sb_secret_test_only';
const objects = new Map();
const requests = [];

function itemFor(key, prefix) {
  const name = prefix ? key.slice(prefix.length).replace(/^\//, '') : key;
  if (name.includes('/')) return null;
  const object = objects.get(key);
  return {
    id: `id:${key}`,
    name,
    metadata: {
      size: Buffer.byteLength(object.body),
      mimetype: object.content_type
    }
  };
}

async function fetchMock(url, options = {}) {
  const parsed = new URL(url);
  const method = String(options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  requests.push({ url, method, headers, body: options.body });
  assert.equal(parsed.origin, origin);
  assert.equal(headers.get('authorization'), null, 'modern sb_secret key must never be sent as Bearer JWT');
  assert.equal(headers.get('apikey'), secret);

  const storagePath = parsed.pathname.replace('/storage/v1', '');
  const signedPrefix = `/object/upload/sign/${bucket}/`;
  if (method === 'POST' && storagePath.startsWith(signedPrefix)) {
    const key = decodeURIComponent(storagePath.slice(signedPrefix.length)).split('/').map(decodeURIComponent).join('/');
    return Response.json({ url: `/object/upload/sign/${bucket}/${key}?token=provider-test-token` });
  }

  if (method === 'POST' && storagePath === `/object/list/${bucket}`) {
    const body = JSON.parse(options.body || '{}');
    const prefix = String(body.prefix || '').replace(/^\/+|\/+$/g, '');
    const all = [...objects.keys()].sort();
    const direct = [];
    const folders = new Set();
    for (const key of all) {
      if (prefix && !key.startsWith(`${prefix}/`)) continue;
      const remainder = prefix ? key.slice(prefix.length + 1) : key;
      if (!remainder || remainder.startsWith('../')) continue;
      const [first, ...rest] = remainder.split('/');
      if (rest.length) folders.add(first);
      else {
        const item = itemFor(key, prefix);
        if (item) direct.push(item);
      }
    }
    const folderItems = [...folders].map(name => ({ id: null, name, metadata: null }));
    const combined = [...folderItems, ...direct].sort((a, b) => a.name.localeCompare(b.name));
    const offset = Number(body.offset || 0);
    const limit = Number(body.limit || 100);
    return Response.json(combined.slice(offset, offset + limit));
  }

  if (storagePath === `/object/${bucket}` && method === 'DELETE') {
    const body = JSON.parse(options.body || '{}');
    for (const key of body.prefixes || []) objects.delete(key);
    return Response.json((body.prefixes || []).map(name => ({ name })));
  }

  const objectPrefix = `/object/${bucket}/`;
  if (storagePath.startsWith(objectPrefix)) {
    const key = storagePath.slice(objectPrefix.length).split('/').map(decodeURIComponent).join('/');
    if (method === 'HEAD') {
      const object = objects.get(key);
      if (!object) return new Response(null, { status: 404 });
      return new Response(null, {
        status: 200,
        headers: {
          'content-length': String(Buffer.byteLength(object.body)),
          'content-type': object.content_type,
          etag: 'test-etag'
        }
      });
    }
    if (method === 'POST') {
      objects.set(key, { body: String(options.body ?? ''), content_type: new Headers(options.headers).get('content-type') || 'application/octet-stream' });
      return Response.json({ Id: `id:${key}`, Key: `${bucket}/${key}` });
    }
    if (method === 'GET') {
      const object = objects.get(key);
      if (!object) return new Response('not found', { status: 404 });
      return new Response(object.body, { status: 200, headers: { 'content-type': object.content_type } });
    }
  }

  throw new Error(`Unexpected mock request: ${method} ${url}`);
}

assert.equal(normalizeStorageKey('cases/owner/case/doc.pdf'), 'cases/owner/case/doc.pdf');
assert.equal(normalizeStorageKey('cases/owner/case/', { allow_trailing_slash: true }), 'cases/owner/case/');
assert.throws(() => normalizeStorageKey('../secret'), /invalid segment/i);
assert.throws(() => normalizeStorageKey('/absolute/path'), /bucket-relative/i);
assert.throws(() => createSupabaseStorageProvider({ supabaseUrl: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co', secretKey: secret, fetchImpl: fetchMock }), /dedicated Fakturasjekk/i);
assert.throws(() => createSupabaseStorageProvider({ supabaseUrl: origin, secretKey: 'public-key', fetchImpl: fetchMock }), /secret key format/i);

const provider = createSupabaseStorageProvider({ supabaseUrl: origin, secretKey: secret, fetchImpl: fetchMock });
const signed = await provider.createSignedPut({ bucket, key: 'cases/owner-1/case-1/doc-1.pdf', content_type: 'application/pdf' });
assert.match(signed.url, /^https:\/\/jxmkaxwflouacuboaetg\.supabase\.co\/storage\/v1\/object\/upload\/sign\//);
assert.equal(signed.provider_expires_in_seconds, 7200);
assert.deepEqual(signed.required_headers, { 'content-type': 'application/pdf' });

objects.set('cases/owner-1/case-1/doc-1.pdf', { body: '%PDF-synthetic', content_type: 'application/pdf' });
const head = await provider.headObject({ bucket, key: 'cases/owner-1/case-1/doc-1.pdf' });
assert.equal(head.exists, true);
assert.equal(head.byte_size, Buffer.byteLength('%PDF-synthetic'));
assert.equal(head.content_type, 'application/pdf');
assert.deepEqual(await provider.headObject({ bucket, key: 'cases/owner-1/case-1/missing.pdf' }), { exists: false });

const privateBytes = await provider.getObjectBytes({ bucket, key: 'cases/owner-1/case-1/doc-1.pdf', max_bytes: 100 });
assert.equal(new TextDecoder().decode(privateBytes.bytes), '%PDF-synthetic');
assert.equal(privateBytes.byte_size, Buffer.byteLength('%PDF-synthetic'));
assert.equal(privateBytes.content_type, 'application/pdf');
await assert.rejects(() => provider.getObjectBytes({ bucket, key: 'cases/owner-1/case-1/doc-1.pdf', max_bytes: 4 }), /scanner byte limit/i);
await assert.rejects(() => provider.getObjectBytes({ bucket, key: 'cases/owner-1/case-1/missing.pdf', max_bytes: 100 }), /not found/i);

await provider.putObject({ bucket, key: 'deletion-ledger/case-1.json', body: JSON.stringify({ version: 1, case_id: 'case-1', deleted_at: '2026-08-19T12:00:00.000Z' }), content_type: 'application/json', cache_control: 'no-store' });
const ledgerList = await provider.listPrefix({ bucket, prefix: 'deletion-ledger/' });
assert.deepEqual(ledgerList.items.map(item => item.key), ['deletion-ledger/case-1.json']);
const ledger = await provider.getObject({ bucket, key: 'deletion-ledger/case-1.json' });
assert.match(ledger.body, /"case_id":"case-1"/);

objects.set('cases/owner-1/case-1/nested/extra.txt', { body: 'synthetic', content_type: 'text/plain' });
const deleted = await provider.deletePrefix({ bucket, prefix: 'cases/owner-1/case-1/' });
assert.equal(deleted.deleted_count, 2);
assert.equal(objects.has('cases/owner-1/case-1/doc-1.pdf'), false);
assert.equal(objects.has('cases/owner-1/case-1/nested/extra.txt'), false);
assert.equal(objects.has('deletion-ledger/case-1.json'), true, 'deletion ledger must live outside the case object prefix');

const now = new Date('2026-08-19T12:00:00.000Z');
const storage = createPrivateObjectStorageAdapter({
  provider,
  scanner: { async scanObject() { return { malware_safe: true, magic_bytes_verified: true, detected_mime_type: 'application/pdf', sha256: 'synthetic-sha' }; } },
  bucket,
  upload_ttl_seconds: 600,
  max_provider_upload_ttl_seconds: 7200,
  clock: () => new Date(now)
});
const reserved = await storage.reservePrivateObject({ case_id: 'case-2', owner_id: 'owner-2', document_id: 'doc-2', mime_type: 'application/pdf', byte_size: 100 });
assert.equal(reserved.expires_at, '2026-08-19T12:10:00.000Z', 'Fakturasjekk acceptance window must stay at 10 minutes');
assert.equal(reserved.provider_expires_at, '2026-08-19T14:00:00.000Z', 'provider token may outlive the application acceptance window');

const serializedRequests = JSON.stringify(requests.map(r => ({ url: r.url, method: r.method })));
assert.equal(serializedRequests.includes(secret), false, 'secret must never be embedded in provider URLs or serialized request metadata');

console.log('OK Supabase private Storage provider uses modern secret as apikey-only, stays project-bound, scanner-readable and deletion-verifying.');
