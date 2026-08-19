const EXPECTED_PROJECT_REF = 'jxmkaxwflouacuboaetg';
const EXPECTED_ORIGIN = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const PROVIDER_SIGNED_UPLOAD_TTL_SECONDS = 7200;
const LIST_PAGE_SIZE = 100;

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

function projectOrigin(value) {
  let origin;
  try { origin = new URL(required(value, 'supabaseUrl')).origin; }
  catch { throw new Error('supabaseUrl must be a valid URL.'); }
  if (origin !== EXPECTED_ORIGIN) throw new Error('Supabase Storage provider must use the dedicated Fakturasjekk project.');
  return origin;
}

function safeSegment(segment) {
  if (!segment || segment === '.' || segment === '..') throw new Error('Storage path contains an invalid segment.');
  if (/[\u0000-\u001f\u007f]/.test(segment)) throw new Error('Storage path contains control characters.');
  return segment;
}

export function normalizeStorageKey(value, { allow_trailing_slash = false } = {}) {
  const raw = required(value, 'storage key').replaceAll('\\', '/');
  if (raw.startsWith('/')) throw new Error('Storage key must be bucket-relative.');
  const trailing = raw.endsWith('/');
  const parts = raw.split('/').filter(Boolean).map(safeSegment);
  if (!parts.length) throw new Error('Storage key is empty.');
  const normalized = parts.join('/');
  return allow_trailing_slash && trailing ? `${normalized}/` : normalized;
}

function encodeKey(key) {
  return normalizeStorageKey(key).split('/').map(encodeURIComponent).join('/');
}

function encodeBucket(bucket) {
  return encodeURIComponent(safeSegment(required(bucket, 'bucket')));
}

function providerHeaders(secretKey, extra = {}) {
  return {
    authorization: `Bearer ${secretKey}`,
    apikey: secretKey,
    ...extra
  };
}

async function readJson(response, label) {
  const text = await response.text();
  if (!response.ok) {
    let detail = '';
    try {
      const parsed = text ? JSON.parse(text) : null;
      detail = parsed?.message || parsed?.error || parsed?.statusCode || '';
    } catch {}
    throw new Error(`${label} failed with HTTP ${response.status}${detail ? `: ${String(detail).slice(0, 180)}` : ''}.`);
  }
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { throw new Error(`${label} returned invalid JSON.`); }
}

function contentLength(headers) {
  const value = Number(headers.get('content-length'));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function itemByteSize(item) {
  const candidates = [item?.metadata?.size, item?.metadata?.contentLength, item?.metadata?.content_length];
  for (const value of candidates) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return null;
}

function itemMime(item) {
  return item?.metadata?.mimetype || item?.metadata?.mimeType || item?.metadata?.contentType || item?.metadata?.content_type || null;
}

function joinKey(prefix, name) {
  const cleanPrefix = String(prefix || '').replace(/^\/+|\/+$/g, '');
  const cleanName = String(name || '').replace(/^\/+|\/+$/g, '');
  return cleanPrefix ? `${cleanPrefix}/${cleanName}` : cleanName;
}

function isFolderItem(item) {
  return !item?.id && !item?.metadata && typeof item?.name === 'string' && item.name.length > 0;
}

export function createSupabaseStorageProvider({ supabaseUrl, secretKey, fetchImpl = globalThis.fetch } = {}) {
  const origin = projectOrigin(supabaseUrl);
  const secret = required(secretKey, 'secretKey');
  if (!/^sb_secret_/i.test(secret) && !/^eyJ/i.test(secret)) throw new Error('Unexpected Supabase secret key format.');
  if (typeof fetchImpl !== 'function') throw new Error('fetchImpl is required.');
  const storageBase = `${origin}/storage/v1`;

  async function listFolder({ bucket, prefix = '', limit = LIST_PAGE_SIZE, offset = 0 }) {
    const normalizedPrefix = prefix ? normalizeStorageKey(prefix, { allow_trailing_slash: false }) : '';
    const response = await fetchImpl(`${storageBase}/object/list/${encodeBucket(bucket)}`, {
      method: 'POST',
      headers: providerHeaders(secret, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        prefix: normalizedPrefix,
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' }
      })
    });
    const data = await readJson(response, 'Supabase Storage list');
    if (!Array.isArray(data)) throw new Error('Supabase Storage list returned an unexpected payload.');
    return data;
  }

  async function listAllFolder({ bucket, prefix = '' }) {
    const output = [];
    for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
      const page = await listFolder({ bucket, prefix, limit: LIST_PAGE_SIZE, offset });
      output.push(...page);
      if (page.length < LIST_PAGE_SIZE) break;
      if (offset > 100000) throw new Error('Supabase Storage listing exceeded safety pagination limit.');
    }
    return output;
  }

  async function listRecursive({ bucket, prefix = '' }) {
    const output = [];
    const items = await listAllFolder({ bucket, prefix });
    for (const item of items) {
      if (typeof item?.name !== 'string' || !item.name) continue;
      const key = joinKey(prefix, item.name);
      if (isFolderItem(item)) output.push(...await listRecursive({ bucket, prefix: key }));
      else output.push({ key, metadata: item.metadata ?? null, id: item.id ?? null });
    }
    return output;
  }

  async function exactListEntry({ bucket, key }) {
    const normalized = normalizeStorageKey(key);
    const slash = normalized.lastIndexOf('/');
    const parent = slash >= 0 ? normalized.slice(0, slash) : '';
    const basename = slash >= 0 ? normalized.slice(slash + 1) : normalized;
    const items = await listAllFolder({ bucket, prefix: parent });
    const item = items.find(entry => entry?.name === basename && !isFolderItem(entry));
    return item ? { key: normalized, item } : null;
  }

  async function objectExists({ bucket, key }) {
    const normalized = normalizeStorageKey(key);
    const response = await fetchImpl(`${storageBase}/object/${encodeBucket(bucket)}/${encodeKey(normalized)}`, {
      method: 'HEAD',
      headers: providerHeaders(secret)
    });
    if (response.status === 404) return { exists: false };
    if (!response.ok) throw new Error(`Supabase Storage HEAD failed with HTTP ${response.status}.`);
    return {
      exists: true,
      byte_size: contentLength(response.headers),
      content_type: response.headers.get('content-type') || null,
      etag: response.headers.get('etag') || null
    };
  }

  async function deleteExactPaths({ bucket, paths }) {
    const unique = [...new Set(paths.map(path => normalizeStorageKey(path)))];
    if (!unique.length) return 0;
    const response = await fetchImpl(`${storageBase}/object/${encodeBucket(bucket)}`, {
      method: 'DELETE',
      headers: providerHeaders(secret, { 'content-type': 'application/json' }),
      body: JSON.stringify({ prefixes: unique })
    });
    await readJson(response, 'Supabase Storage delete');

    let deleted = 0;
    for (const key of unique) {
      const after = await objectExists({ bucket, key });
      if (!after.exists) deleted += 1;
    }
    if (deleted !== unique.length) throw new Error('Supabase Storage deletion could not be verified for every requested object.');
    return deleted;
  }

  return {
    async createSignedPut({ bucket, key, content_type }) {
      const normalized = normalizeStorageKey(key);
      const response = await fetchImpl(`${storageBase}/object/upload/sign/${encodeBucket(bucket)}/${encodeKey(normalized)}`, {
        method: 'POST',
        headers: providerHeaders(secret, { 'content-type': 'application/json', 'x-upsert': 'false' }),
        body: '{}'
      });
      const data = await readJson(response, 'Supabase signed upload URL');
      const providerPath = typeof data?.url === 'string' ? data.url : (typeof data?.signedURL === 'string' ? data.signedURL : null);
      if (!providerPath) throw new Error('Supabase signed upload response did not include a URL.');
      const url = /^https:\/\//i.test(providerPath)
        ? providerPath
        : `${storageBase}${providerPath.startsWith('/') ? '' : '/'}${providerPath}`;
      if (new URL(url).origin !== origin) throw new Error('Supabase signed upload URL escaped the dedicated project origin.');
      return {
        url,
        provider_expires_in_seconds: PROVIDER_SIGNED_UPLOAD_TTL_SECONDS,
        required_headers: { 'content-type': content_type }
      };
    },

    async headObject({ bucket, key }) {
      const normalized = normalizeStorageKey(key);
      const head = await objectExists({ bucket, key: normalized });
      if (!head.exists) return { exists: false };
      if (head.byte_size != null && head.content_type) return head;
      const listed = await exactListEntry({ bucket, key: normalized });
      return {
        ...head,
        byte_size: head.byte_size ?? itemByteSize(listed?.item),
        content_type: head.content_type ?? itemMime(listed?.item)
      };
    },

    async listPrefix({ bucket, prefix }) {
      const normalized = normalizeStorageKey(prefix, { allow_trailing_slash: true });
      if (normalized.endsWith('/')) {
        const directory = normalized.slice(0, -1);
        return { items: await listRecursive({ bucket, prefix: directory }) };
      }
      const exact = await exactListEntry({ bucket, key: normalized });
      return { items: exact ? [{ key: exact.key, metadata: exact.item.metadata ?? null, id: exact.item.id ?? null }] : [] };
    },

    async deletePrefix({ bucket, prefix }) {
      const normalized = normalizeStorageKey(prefix, { allow_trailing_slash: true });
      let paths;
      if (normalized.endsWith('/')) {
        const listed = await listRecursive({ bucket, prefix: normalized.slice(0, -1) });
        paths = listed.map(item => item.key);
      } else {
        const exact = await exactListEntry({ bucket, key: normalized });
        paths = exact ? [exact.key] : [];
      }
      return { deleted_count: await deleteExactPaths({ bucket, paths }) };
    },

    async putObject({ bucket, key, body, content_type = 'application/octet-stream', cache_control = 'no-store' }) {
      const normalized = normalizeStorageKey(key);
      const response = await fetchImpl(`${storageBase}/object/${encodeBucket(bucket)}/${encodeKey(normalized)}`, {
        method: 'POST',
        headers: providerHeaders(secret, {
          'content-type': content_type,
          'cache-control': cache_control,
          'x-upsert': 'true'
        }),
        body
      });
      const data = await readJson(response, 'Supabase Storage put');
      return { key: normalized, id: data?.Id ?? data?.id ?? null };
    },

    async getObject({ bucket, key }) {
      const normalized = normalizeStorageKey(key);
      const response = await fetchImpl(`${storageBase}/object/${encodeBucket(bucket)}/${encodeKey(normalized)}`, {
        method: 'GET',
        headers: providerHeaders(secret)
      });
      if (!response.ok) throw new Error(`Supabase Storage get failed with HTTP ${response.status}.`);
      return {
        body: await response.text(),
        content_type: response.headers.get('content-type') || null
      };
    }
  };
}

export const SUPABASE_STORAGE_PROVIDER = Object.freeze({
  project_ref: EXPECTED_PROJECT_REF,
  origin: EXPECTED_ORIGIN,
  provider_signed_upload_ttl_seconds: PROVIDER_SIGNED_UPLOAD_TTL_SECONDS
});
