import assert from 'node:assert/strict';
import { createIdempotencyService } from '../server/idempotency.mjs';

const map = new Map();
const store = {
  async get(key) { return map.get(key) ?? null; },
  async put(key, value) { map.set(key, structuredClone(value)); }
};
const clock = () => new Date('2026-08-18T13:00:00.000Z');
const service = createIdempotencyService({ store, clock });
let calls = 0;
const first = await service.run({ key: 'abcdefgh123', operation: 'create_case', owner_id: 'u1' }, async () => {
  calls += 1;
  return { status: 201, body: { id: 'case-1' } };
});
const replay = await service.run({ key: 'abcdefgh123', operation: 'create_case', owner_id: 'u1' }, async () => {
  calls += 1;
  return { status: 201, body: { id: 'case-2' } };
});
assert.deepEqual(replay, first);
assert.equal(calls, 1);

let failCalls = 0;
await assert.rejects(
  () => service.run({ key: 'retrykey123', operation: 'analyze_case', owner_id: 'u1' }, async () => {
    failCalls += 1;
    throw new Error('temporary failure');
  }),
  /temporary failure/
);
const retry = await service.run({ key: 'retrykey123', operation: 'analyze_case', owner_id: 'u1' }, async () => {
  failCalls += 1;
  return { status: 200, body: { ok: true } };
});
assert.equal(retry.body.ok, true);
assert.equal(failCalls, 2);

await assert.rejects(
  () => service.run({ key: 'bad', operation: 'create_case', owner_id: 'u1' }, async () => ({})),
  /Idempotency-Key/
);

console.log('OK idempotency');
