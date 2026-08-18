import assert from 'node:assert/strict';
import { createMemoryCaseStore, createMemoryStorage } from '../server/reference-adapters.mjs';

const store = createMemoryCaseStore();
const id = await store.nextId('case');
await store.save({ id, owner_id: 'u1', state: 'draft', deleted_at: null });
assert.equal((await store.getOwned(id, 'u1')).id, id);
await assert.rejects(() => store.getOwned(id, 'u2'), /not found|owned/i);
await assert.rejects(() => store.getOwned('missing', 'u1'), /not found|owned/i);

const storage = createMemoryStorage();
const key = await storage.reservePrivateObject({ case_id: id, owner_id: 'u1', document_id: 'doc-1', name: 'faktura.pdf', mime_type: 'application/pdf' });
assert.match(key, /^private\/u1\//);
await storage.markUploaded({ storage_key: key, owner_id: 'u1', byte_size: 1000, sha256: 'abc' });
const docs = await storage.listCaseDocuments({ case_id: id, owner_id: 'u1', records: [{ id: 'doc-1', role: 'invoice', storage_key: key }] });
assert.equal(docs[0].uploaded, true);
assert.equal(docs[0].role, 'invoice');
await assert.rejects(() => storage.listCaseDocuments({ case_id: id, owner_id: 'u2', records: [{ id: 'doc-1', storage_key: key }] }), /not found/i);
assert.equal(await storage.deleteCaseObjects({ case_id: id, owner_id: 'u1' }), 1);

console.log('OK reference adapters');
