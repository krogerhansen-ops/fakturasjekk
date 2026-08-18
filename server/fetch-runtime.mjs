import { matchRoute } from './router.mjs';
import { authenticateRequest } from './auth-adapter.mjs';
import { ApiError, apiErrorResponse } from './api-errors.mjs';
import { DEFAULT_SECURITY_POLICY, securityHeaders, validateOrigin, enforceRequestEnvelope } from './security-policy.mjs';

function headerObject(headers) {
  const out = {};
  for (const [key, value] of headers.entries()) out[key.toLowerCase()] = value;
  return out;
}

function corsHeaders(origin, allowedOrigins) {
  if (!origin || !validateOrigin(origin, allowedOrigins)) return {};
  return {
    'access-control-allow-origin': origin,
    'vary': 'Origin',
    'access-control-allow-credentials': 'true'
  };
}

function responseHeaders({ production, sensitive = true, origin, allowedOrigins, useCors = true, requestId }) {
  return {
    ...securityHeaders({ production, sensitive }),
    ...(useCors ? corsHeaders(origin, allowedOrigins) : {}),
    'x-request-id': requestId,
    'content-type': 'application/json; charset=utf-8'
  };
}

function jsonResponse(status, body, headers = {}) {
  const payload = body == null ? '' : JSON.stringify(body);
  return new Response(payload, { status, headers });
}

function routedPathname(url, basePath = '') {
  const pathname = url.pathname || '/';
  if (!basePath) return pathname;
  const normalized = `/${String(basePath).split('/').filter(Boolean).join('/')}`;
  if (pathname === normalized) return '/';
  if (!pathname.startsWith(`${normalized}/`)) return pathname;
  return pathname.slice(normalized.length) || '/';
}

async function readRawBody(request, maxBytes) {
  if (request.method === 'GET' || request.method === 'DELETE') return '';
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError(413, 'request_too_large', 'Forespørselen er for stor.');
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new ApiError(413, 'request_too_large', 'Forespørselen er for stor.');
  return bytes.byteLength ? new TextDecoder().decode(bytes) : '';
}

function parseJsonBody(raw, contentType) {
  if (!raw) return null;
  const normalized = String(contentType ?? '').split(';')[0].trim().toLowerCase();
  if (normalized && normalized !== 'application/json') {
    throw new ApiError(415, 'unsupported_media_type', 'API-et godtar JSON for denne forespørselen.');
  }
  try { return JSON.parse(raw); } catch { throw new ApiError(400, 'invalid_json', 'Ugyldig JSON.'); }
}

export function createFetchHandler({
  api,
  authAdapter,
  allowedOrigins = [],
  securityPolicy = DEFAULT_SECURITY_POLICY,
  rateLimiter = null,
  production = true,
  basePath = ''
} = {}) {
  if (!api?.invoke) throw new Error('API instance is required.');

  return async function fetchHandler(request) {
    const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
    const origin = request.headers.get('origin');
    let matched = null;

    try {
      const url = new URL(request.url);
      const pathname = routedPathname(url, basePath);
      const headers = headerObject(request.headers);

      if (request.method === 'OPTIONS') {
        const requestedMethod = String(request.headers.get('access-control-request-method') ?? '').toUpperCase();
        matched = requestedMethod ? matchRoute(requestedMethod, pathname) : null;
        if (!matched || matched.route.cors === false) throw new ApiError(404, 'route_not_found', 'Endepunktet finnes ikke.');
        if (origin && !validateOrigin(origin, allowedOrigins)) throw new ApiError(403, 'origin_not_allowed', 'Origin er ikke tillatt.');
        return new Response(null, {
          status: 204,
          headers: {
            ...securityHeaders({ production, sensitive: true }),
            ...corsHeaders(origin, allowedOrigins),
            'x-request-id': requestId,
            'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
            'access-control-allow-headers': 'authorization, content-type, idempotency-key, x-request-id',
            'access-control-max-age': '600'
          }
        });
      }

      enforceRequestEnvelope({ method: request.method, headers }, securityPolicy);
      matched = matchRoute(request.method, pathname);
      if (!matched) throw new ApiError(404, 'route_not_found', 'Endepunktet finnes ikke.');

      const useCors = matched.route.cors !== false;
      if (useCors && origin && !validateOrigin(origin, allowedOrigins)) {
        throw new ApiError(403, 'origin_not_allowed', 'Origin er ikke tillatt.');
      }

      const auth = matched.route.auth === false
        ? { user: null }
        : await authenticateRequest({ headers }, authAdapter);

      const rateKey = auth.user?.id ?? (matched.route.auth === false ? `server:${matched.route.action}` : 'anonymous');
      if (rateLimiter && (auth.user?.id || matched.route.auth === false)) {
        const rule = securityPolicy.rate_limits[matched.route.action]
          ?? securityPolicy.rate_limits[matched.route.mutation ? matched.route.action : 'read']
          ?? securityPolicy.rate_limits.read;
        if (rule) await rateLimiter.check({ owner_id: rateKey, action: matched.route.action, rule });
      }

      const rawBody = await readRawBody(request, securityPolicy.json_body_max_bytes);
      const body = matched.route.raw_body ? null : parseJsonBody(rawBody, request.headers.get('content-type'));
      const output = await api.invoke(matched.route.action, {
        request_id: requestId,
        method: request.method,
        headers,
        params: matched.params,
        query: Object.fromEntries(url.searchParams.entries()),
        body,
        raw_body: matched.route.raw_body ? rawBody : null,
        auth
      });

      return jsonResponse(output.status, output.body, responseHeaders({
        production,
        sensitive: true,
        origin,
        allowedOrigins,
        useCors,
        requestId
      }));
    } catch (error) {
      const useCors = matched?.route?.cors !== false;
      const output = apiErrorResponse(error, requestId);
      return jsonResponse(output.status, output.body, responseHeaders({
        production,
        sensitive: true,
        origin,
        allowedOrigins,
        useCors,
        requestId
      }));
    }
  };
}
