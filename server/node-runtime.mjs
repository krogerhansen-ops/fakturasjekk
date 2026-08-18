import crypto from 'node:crypto';
import http from 'node:http';
import { matchRoute } from './router.mjs';
import { authenticateRequest } from './auth-adapter.mjs';
import { ApiError, apiErrorResponse } from './api-errors.mjs';
import { DEFAULT_SECURITY_POLICY, securityHeaders, validateOrigin, enforceRequestEnvelope } from './security-policy.mjs';

function sendJson(res, status, body, headers = {}) {
  const payload = body == null ? '' : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(payload), ...headers });
  res.end(payload);
}

async function readRawBody(req, maxBytes) {
  if (req.method === 'GET' || req.method === 'DELETE') return '';
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new ApiError(413, 'request_too_large', 'Forespørselen er for stor.');
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks).toString('utf8') : '';
}

function parseJsonBody(raw, contentType) {
  if (!raw) return null;
  const normalized = String(contentType ?? '').split(';')[0].trim().toLowerCase();
  if (normalized && normalized !== 'application/json') throw new ApiError(415, 'unsupported_media_type', 'API-et godtar JSON for denne forespørselen.');
  try { return JSON.parse(raw); } catch { throw new ApiError(400, 'invalid_json', 'Ugyldig JSON.'); }
}

function corsHeaders(origin, allowedOrigins) {
  if (!origin || !validateOrigin(origin, allowedOrigins)) return {};
  return { 'access-control-allow-origin': origin, 'vary': 'Origin', 'access-control-allow-credentials': 'true' };
}

export function createNodeHandler({ api, authAdapter, allowedOrigins = [], securityPolicy = DEFAULT_SECURITY_POLICY, rateLimiter = null, production = true } = {}) {
  if (!api?.invoke) throw new Error('API instance is required.');

  return async function handler(req, res) {
    const requestId = String(req.headers['x-request-id'] ?? crypto.randomUUID());
    const origin = req.headers.origin ?? null;
    let matched = null;

    try {
      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'OPTIONS') {
        const requestedMethod = String(req.headers['access-control-request-method'] ?? '').toUpperCase();
        matched = requestedMethod ? matchRoute(requestedMethod, url.pathname) : null;
        if (!matched || matched.route.cors === false) throw new ApiError(404, 'route_not_found', 'Endepunktet finnes ikke.');
        if (origin && !validateOrigin(origin, allowedOrigins)) throw new ApiError(403, 'origin_not_allowed', 'Origin er ikke tillatt.');
        res.writeHead(204, {
          ...securityHeaders({ production, sensitive: true }),
          ...corsHeaders(origin, allowedOrigins),
          'x-request-id': requestId,
          'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type, idempotency-key, x-request-id',
          'access-control-max-age': '600'
        });
        res.end();
        return;
      }

      enforceRequestEnvelope({ method: req.method, headers: req.headers }, securityPolicy);
      matched = matchRoute(req.method, url.pathname);
      if (!matched) throw new ApiError(404, 'route_not_found', 'Endepunktet finnes ikke.');

      const useCors = matched.route.cors !== false;
      if (useCors && origin && !validateOrigin(origin, allowedOrigins)) throw new ApiError(403, 'origin_not_allowed', 'Origin er ikke tillatt.');
      const baseHeaders = {
        ...securityHeaders({ production, sensitive: true }),
        ...(useCors ? corsHeaders(origin, allowedOrigins) : {}),
        'x-request-id': requestId
      };

      const auth = matched.route.auth === false ? { user: null } : await authenticateRequest({ headers: req.headers }, authAdapter);
      const rateKey = auth.user?.id ?? (matched.route.auth === false ? `server:${req.socket.remoteAddress ?? 'unknown'}` : 'anonymous');
      if (rateLimiter && (auth.user?.id || matched.route.auth === false)) {
        const rule = securityPolicy.rate_limits[matched.route.action] ?? securityPolicy.rate_limits[matched.route.mutation ? matched.route.action : 'read'] ?? securityPolicy.rate_limits.read;
        if (rule) await rateLimiter.check({ owner_id: rateKey, action: matched.route.action, rule });
      }

      const rawBody = await readRawBody(req, securityPolicy.json_body_max_bytes);
      const body = matched.route.raw_body ? null : parseJsonBody(rawBody, req.headers['content-type']);
      const output = await api.invoke(matched.route.action, {
        request_id: requestId,
        method: req.method,
        headers: req.headers,
        params: matched.params,
        query: Object.fromEntries(url.searchParams.entries()),
        body,
        raw_body: matched.route.raw_body ? rawBody : null,
        auth
      });
      sendJson(res, output.status, output.body, baseHeaders);
    } catch (error) {
      const useCors = matched?.route?.cors !== false;
      const baseHeaders = {
        ...securityHeaders({ production, sensitive: true }),
        ...(useCors ? corsHeaders(origin, allowedOrigins) : {}),
        'x-request-id': requestId
      };
      const output = apiErrorResponse(error, requestId);
      sendJson(res, output.status, output.body, baseHeaders);
    }
  };
}

export function startNodeServer({ handler, port = 3000, host = '127.0.0.1' } = {}) {
  if (!handler) throw new Error('handler is required');
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}
