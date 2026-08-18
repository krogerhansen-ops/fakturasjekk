import assert from 'node:assert/strict';
import { createDistributedRateLimiter, createMemoryAtomicCounterStore } from '../server/distributed-rate-limit.mjs';

let now = 1000;
const store = createMemoryAtomicCounterStore({ clock: () => now });
const limiter = createDistributedRateLimiter({ counterStore: store });
const rule = { window_ms: 1000, max: 2 };
const first = await limiter.check({ owner_id: 'u1', action: 'analyze_case', rule });
assert.equal(first.remaining, 1);
const second = await limiter.check({ owner_id: 'u1', action: 'analyze_case', rule });
assert.equal(second.remaining, 0);
await assert.rejects(
  () => limiter.check({ owner_id: 'u1', action: 'analyze_case', rule }),
  error => error?.status === 429 && error?.code === 'rate_limit_exceeded'
);
const otherUser = await limiter.check({ owner_id: 'u2', action: 'analyze_case', rule });
assert.equal(otherUser.remaining, 1);
now = 3000;
const reset = await limiter.check({ owner_id: 'u1', action: 'analyze_case', rule });
assert.equal(reset.remaining, 1);

console.log('OK distributed rate limit');
