import assert from 'node:assert/strict';
import { createPostgresAtomicCounterStore } from '../server/postgres-rate-limit.mjs';

let calls = 0;
const db = {
  async query(sql, params) {
    calls += 1;
    assert.match(sql, /ON CONFLICT \(key\) DO UPDATE/);
    assert.equal(params[0], 'fakturasjekk:rl:analyze:u1');
    assert.equal(params[1], 60000);
    return { rows: [{ count: String(calls), reset_at_ms: '1770000000000' }] };
  }
};
const store = createPostgresAtomicCounterStore({ db });
const a = await store.incrementWindow({ key: 'fakturasjekk:rl:analyze:u1', window_ms: 60000 });
assert.equal(a.count, 1);
assert.equal(a.reset_at, 1770000000000);
const b = await store.incrementWindow({ key: 'fakturasjekk:rl:analyze:u1', window_ms: 60000 });
assert.equal(b.count, 2);
await assert.rejects(() => store.incrementWindow({ key: '', window_ms: 0 }), /Invalid rate-limit/);

console.log('OK PostgreSQL rate-limit store');
