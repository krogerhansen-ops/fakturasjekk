import http from 'node:http';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function frame(chunk) {
  const size = Buffer.allocUnsafe(4);
  size.writeUInt32BE(chunk.length, 0);
  return Buffer.concat([size, chunk]);
}

export function buildClamdInstreamPayload(bytes, chunkBytes = 64 * 1024) {
  const source = Buffer.from(bytes);
  const parts = [Buffer.from('zINSTREAM\0')];
  for (let offset = 0; offset < source.length; offset += chunkBytes) {
    parts.push(frame(source.subarray(offset, Math.min(source.length, offset + chunkBytes))));
  }
  parts.push(Buffer.alloc(4));
  return Buffer.concat(parts);
}

export function parseClamdScanResponse(raw) {
  const text = String(raw ?? '').replace(/\0+$/g, '').trim();
  if (/^stream: OK$/i.test(text)) return { safe: true, status: 'clean' };
  if (/^stream: .+ FOUND$/i.test(text)) return { safe: false, status: 'infected' };
  if (/^stream: .+ ERROR$/i.test(text)) throw new Error('ClamAV reported a scan error.');
  throw new Error('ClamAV returned an unknown scan response.');
}

export function parseClamdVersion(raw) {
  const text = String(raw ?? '').replace(/\0+$/g, '').trim();
  const match = text.match(/^ClamAV\s+([^/\s]+)(?:\/[^/\s]+)?(?:\/.*)?$/i);
  if (!match) throw new Error('ClamAV returned an invalid version response.');
  return { engine: 'ClamAV', version: match[1] };
}

function clamdCommand({ host, port, payload, timeoutMs = 25000 }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const chunks = [];
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('ClamAV command timed out.')), timeoutMs);
    socket.on('connect', () => socket.write(payload));
    socket.on('data', chunk => chunks.push(Buffer.from(chunk)));
    socket.on('end', () => { clearTimeout(timer); finish(null, Buffer.concat(chunks).toString('utf8')); });
    socket.on('error', error => { clearTimeout(timer); finish(new Error(`ClamAV connection failed: ${error.message}`)); });
  });
}

async function scanWithClamd({ bytes, host, port }) {
  const [versionRaw, scanRaw] = await Promise.all([
    clamdCommand({ host, port, payload: Buffer.from('zVERSION\0') }),
    clamdCommand({ host, port, payload: buildClamdInstreamPayload(bytes) })
  ]);
  return { ...parseClamdScanResponse(scanRaw), ...parseClamdVersion(versionRaw) };
}

export async function readBoundedBody(request, maxBytes = MAX_BYTES) {
  const declared = Number(request.headers['content-length']);
  if (!Number.isInteger(declared) || declared <= 0 || declared > maxBytes) throw new Error('Invalid Content-Length.');
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes || total > declared) throw new Error('Request body exceeds declared or allowed size.');
    chunks.push(Buffer.from(chunk));
  }
  if (total !== declared) throw new Error('Request body length does not match Content-Length.');
  return Buffer.concat(chunks);
}

function json(response, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(payload.length),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  response.end(payload);
}

export function createClamavHttpServer({
  clamdHost = '127.0.0.1',
  clamdPort = 3310,
  maxBytes = MAX_BYTES,
  scanImpl = scanWithClamd
} = {}) {
  return http.createServer(async (request, response) => {
    try {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (request.method === 'GET' && path === '/health') {
        return json(response, 200, { ok: true, service: 'fakturasjekk-clamav' });
      }
      if (request.method !== 'POST' || path !== '/scan') return json(response, 404, { error: 'not_found' });
      if (request.headers['content-type'] !== 'application/octet-stream') return json(response, 415, { error: 'unsupported_media_type' });

      const expectedSha = required(request.headers['x-fakturasjekk-sha256'], 'x-fakturasjekk-sha256').toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(expectedSha)) return json(response, 400, { error: 'invalid_digest' });
      const mime = required(request.headers['x-fakturasjekk-mime'], 'x-fakturasjekk-mime');
      if (!ALLOWED_MIME.has(mime)) return json(response, 415, { error: 'unsupported_document_type' });

      const bytes = await readBoundedBody(request, maxBytes);
      const actualSha = sha256(bytes);
      if (actualSha !== expectedSha) return json(response, 400, { error: 'digest_mismatch' });

      let verdict;
      try {
        verdict = await scanImpl({ bytes, host: clamdHost, port: clamdPort });
      } catch {
        return json(response, 503, { error: 'scanner_unavailable' });
      }
      if (verdict?.safe === true && verdict?.status !== 'clean') return json(response, 503, { error: 'invalid_scanner_verdict' });
      if (verdict?.safe !== true && verdict?.status !== 'infected') return json(response, 503, { error: 'invalid_scanner_verdict' });
      return json(response, 200, {
        safe: verdict.safe === true,
        status: verdict.status,
        engine: required(verdict.engine, 'scanner engine').slice(0, 80),
        version: required(verdict.version, 'scanner version').slice(0, 80),
        sha256: actualSha
      });
    } catch {
      return json(response, 400, { error: 'invalid_scan_request' });
    }
  });
}

async function main() {
  const port = Number(process.env.PORT ?? 8080);
  const clamdHost = process.env.CLAMD_HOST ?? '127.0.0.1';
  const clamdPort = Number(process.env.CLAMD_PORT ?? 3310);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('PORT is invalid.');
  if (!Number.isInteger(clamdPort) || clamdPort <= 0 || clamdPort > 65535) throw new Error('CLAMD_PORT is invalid.');
  const server = createClamavHttpServer({ clamdHost, clamdPort });
  server.listen(port, '0.0.0.0');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => process.exit(1));
}

export const CLAMAV_SERVICE_POLICY = Object.freeze({
  max_file_bytes: MAX_BYTES,
  allowed_mime_types: [...ALLOWED_MIME],
  request_body_logging: false,
  clean_requires_engine_and_version: true
});
