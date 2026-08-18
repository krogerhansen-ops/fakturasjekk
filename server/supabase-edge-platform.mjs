import {
  createSupabaseServerRest,
  createSupabaseCaseStore,
  createSupabaseIdempotencyStore,
  createSupabasePaymentEventStore,
  createSupabaseAuditAdapter,
  createSupabaseAtomicCounterStore
} from './supabase-data-adapters.mjs';
import { createSupabaseAuthAdapter } from './supabase-auth-adapter.mjs';
import { createDistributedRateLimiter } from './distributed-rate-limit.mjs';

const EXPECTED_PROJECT_REF = 'jxmkaxwflouacuboaetg';
const EXPECTED_ORIGIN = `https://${EXPECTED_PROJECT_REF}.supabase.co`;

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

function keyFromJson(raw, name) {
  if (!raw) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error(`${name} must be valid JSON.`); }
  const value = parsed?.default;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function loadSupabaseEdgeSecrets(env = globalThis.Deno?.env?.toObject?.() ?? process.env) {
  const supabaseUrl = required(env.SUPABASE_URL, 'SUPABASE_URL');
  let origin;
  try { origin = new URL(supabaseUrl).origin; } catch { throw new Error('SUPABASE_URL must be valid.'); }
  if (origin !== EXPECTED_ORIGIN) throw new Error('SUPABASE_URL is not the dedicated Fakturasjekk project.');

  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY?.trim()
    || keyFromJson(env.SUPABASE_PUBLISHABLE_KEYS, 'SUPABASE_PUBLISHABLE_KEYS');
  const secretKey = env.SUPABASE_SECRET_KEY?.trim()
    || keyFromJson(env.SUPABASE_SECRET_KEYS, 'SUPABASE_SECRET_KEYS');

  if (!publishableKey) throw new Error('Supabase publishable key is missing.');
  if (!secretKey) throw new Error('Supabase secret key is missing.');
  if (!/^sb_publishable_/i.test(publishableKey) && !/^eyJ/i.test(publishableKey)) {
    throw new Error('Unexpected Supabase publishable key format.');
  }
  if (!/^sb_secret_/i.test(secretKey) && !/^eyJ/i.test(secretKey)) {
    throw new Error('Unexpected Supabase secret key format.');
  }

  return { supabaseUrl: origin, publishableKey, secretKey };
}

export function createSupabaseEdgePlatformAdapters({
  supabaseUrl,
  publishableKey,
  secretKey,
  fetchImpl = globalThis.fetch
} = {}) {
  if (new URL(required(supabaseUrl, 'supabaseUrl')).origin !== EXPECTED_ORIGIN) {
    throw new Error('Supabase Edge platform must use the dedicated Fakturasjekk project.');
  }

  const rest = createSupabaseServerRest({ supabaseUrl, secretKey, fetchImpl });
  const caseStore = createSupabaseCaseStore({ rest });
  const idempotencyStore = createSupabaseIdempotencyStore({ rest });
  const paymentEventStore = createSupabasePaymentEventStore({ rest });
  const auditAdapter = createSupabaseAuditAdapter({ rest });
  const counterStore = createSupabaseAtomicCounterStore({ rest });
  const rateLimiter = createDistributedRateLimiter({ counterStore });
  const authAdapter = createSupabaseAuthAdapter({ supabaseUrl, publishableKey, fetchImpl });

  return {
    caseStore,
    idempotencyStore,
    paymentEventStore,
    auditAdapter,
    rateLimiter,
    authAdapter
  };
}

export const SUPABASE_EDGE_PROJECT = Object.freeze({
  project_ref: EXPECTED_PROJECT_REF,
  origin: EXPECTED_ORIGIN
});
