import { ApiError } from './api-errors.mjs';

export const DEFAULT_SECURITY_POLICY = Object.freeze({
  json_body_max_bytes: 256 * 1024,
  user_note_max_chars: 4000,
  supplier_response_max_chars: 20000,
  allowed_methods: ['GET', 'POST'],
  rate_limits: {
    create_case: { window_ms: 60_000, max: 10 },
    register_uploads: { window_ms: 60_000, max: 20 },
    analyze_case: { window_ms: 60_000, max: 6 },
    confirm_payment: { window_ms: 60_000, max: 20 },
    supplier_response: { window_ms: 60_000, max: 10 },
    read: { window_ms: 60_000, max: 120 }
  }
});

export function securityHeaders({ production = true, sensitive = true } = {}) {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'cache-control': sensitive ? 'no-store, max-age=0' : 'private, max-age=0',
    ...(production ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } : {})
  };
}

export function validateOrigin(origin, allowedOrigins = []) {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

export function enforceRequestEnvelope(request, policy = DEFAULT_SECURITY_POLICY) {
  const method = String(request?.method ?? '').toUpperCase();
  if (!policy.allowed_methods.includes(method)) {
    throw new ApiError(405, 'method_not_allowed', 'HTTP-metoden er ikke tillatt.');
  }
  const contentLength = Number(request?.headers?.['content-length'] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > policy.json_body_max_bytes) {
    throw new ApiError(413, 'request_too_large', 'Forespørselen er for stor.');
  }
  return true;
}

export function createMemoryRateLimiter({ clock = () => Date.now() } = {}) {
  const buckets = new Map();
  return {
    check({ owner_id, action, rule }) {
      const now = Number(clock());
      const key = `${owner_id}:${action}`;
      const current = buckets.get(key);
      if (!current || now >= current.reset_at) {
        buckets.set(key, { count: 1, reset_at: now + rule.window_ms });
        return { allowed: true, remaining: rule.max - 1, reset_at: now + rule.window_ms };
      }
      current.count += 1;
      if (current.count > rule.max) {
        throw new ApiError(429, 'rate_limit_exceeded', 'For mange forespørsler. Prøv igjen senere.', { reset_at: current.reset_at });
      }
      return { allowed: true, remaining: rule.max - current.count, reset_at: current.reset_at };
    }
  };
}
