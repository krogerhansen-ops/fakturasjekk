import { ApiError } from './api-errors.mjs';

export function createIdempotencyService({ store, ttl_ms = 24 * 60 * 60 * 1000, clock = () => new Date() } = {}) {
  if (!store?.get || !store?.put) throw new Error('Idempotency store requires get and put.');

  async function run({ key, operation, owner_id }, fn) {
    if (typeof key !== 'string' || key.length < 8 || key.length > 200) throw new ApiError(400, 'idempotency_key_required', 'Gyldig Idempotency-Key kreves.');
    const namespace = `${owner_id}:${operation}:${key}`;
    const existing = await store.get(namespace);
    if (existing && new Date(existing.expires_at) > clock()) {
      if (existing.state === 'completed') return existing.response;
      if (existing.state === 'running') throw new ApiError(409, 'request_in_progress', 'Samme operasjon behandles allerede.');
    }

    const expiresAt = new Date(clock().getTime() + ttl_ms).toISOString();
    const base = { owner_id, operation, expires_at: expiresAt };
    await store.put(namespace, { ...base, state: 'running' });
    try {
      const response = await fn();
      await store.put(namespace, { ...base, state: 'completed', response });
      return response;
    } catch (error) {
      await store.put(namespace, { ...base, state: 'failed' });
      throw error;
    }
  }

  return { run };
}
