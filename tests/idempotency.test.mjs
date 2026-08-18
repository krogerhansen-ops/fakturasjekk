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

await assert.rejects(
  () => service.run({ key: 'bad', operation: 'create_case', owner_id: 'u1' }, async () => ({})),
  /Idempotency-Key/
);

console.log('OK idempotency');
