import { ApiError } from './api-errors.mjs';

export function createDistributedRateLimiter({ counterStore, keyPrefix = 'fakturasjekk:rl' } = {}) {
  if (!counterStore?.incrementWindow) throw new Error('Distributed rate limiter requires counterStore.incrementWindow.');

  return {
    async check({ owner_id, action, rule }) {
      if (!owner_id || !action || !rule?.window_ms || !rule?.max) throw new Error('Rate limit input is incomplete.');
      const key = `${keyPrefix}:${action}:${owner_id}`;
      const result = await counterStore.incrementWindow({ key, window_ms: rule.window_ms });
      if (!Number.isInteger(result?.count) || !Number.isFinite(Number(result?.reset_at))) {
        throw new Error('Distributed rate-limit store returned invalid counter state.');
      }
      if (result.count > rule.max) {
        throw new ApiError(429, 'rate_limit_exceeded', 'For mange forespørsler. Prøv igjen senere.', { reset_at: Number(result.reset_at) });
      }
      return { allowed: true, remaining: Math.max(0, rule.max - result.count), reset_at: Number(result.reset_at) };
    }
  };
}

export function createMemoryAtomicCounterStore({ clock = () => Date.now() } = {}) {
  const buckets = new Map();
  return {
    async incrementWindow({ key, window_ms }) {
      const now = Number(clock());
      let bucket = buckets.get(key);
      if (!bucket || now >= bucket.reset_at) bucket = { count: 0, reset_at: now + window_ms };
      bucket.count += 1;
      buckets.set(key, bucket);
      return { ...bucket };
    }
  };
}
