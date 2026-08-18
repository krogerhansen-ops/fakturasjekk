const EXPECTED_SUPABASE_PROJECT_REF = 'jxmkaxwflouacuboaetg';
const EXPECTED_SUPABASE_HOST = `${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`;
const EXPECTED_STORAGE_BUCKET = 'case-documents-private';

function required(env, name) {
  const value = env?.[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing production configuration: ${name}`);
  return value.trim();
}

function parseHttps(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`Invalid URL in ${name}`); }
  if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS in production.`);
  return url;
}

function httpsOrigin(value, name) {
  return parseHttps(value, name).origin;
}

function httpsEndpoint(value, name) {
  const url = parseHttps(value, name);
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/$/, '');
}

function assertDedicatedSupabaseDatabase(databaseUrl, projectRef) {
  let parsed;
  try { parsed = new URL(databaseUrl); } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL.'); }
  if (!/^postgres(ql)?:$/i.test(parsed.protocol)) throw new Error('DATABASE_URL must be PostgreSQL.');

  const host = parsed.hostname.toLowerCase();
  const username = decodeURIComponent(parsed.username || '');
  const directHost = `db.${projectRef}.supabase.co`;
  const directMatch = host === directHost;
  const sharedPoolerMatch = host.endsWith('.pooler.supabase.com') && username === `postgres.${projectRef}`;

  if (!directMatch && !sharedPoolerMatch) {
    throw new Error('DATABASE_URL does not belong to the dedicated Fakturasjekk Supabase project.');
  }
}

export function loadProductionConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') throw new Error('Production config may only be loaded with NODE_ENV=production.');
  const appOrigin = httpsOrigin(required(env, 'APP_ORIGIN'), 'APP_ORIGIN');
  const apiOrigin = httpsOrigin(required(env, 'API_ORIGIN'), 'API_ORIGIN');

  const supabaseProjectRef = required(env, 'SUPABASE_PROJECT_REF');
  if (supabaseProjectRef !== EXPECTED_SUPABASE_PROJECT_REF) {
    throw new Error('SUPABASE_PROJECT_REF must be the dedicated Fakturasjekk production project.');
  }

  const supabaseUrl = httpsOrigin(required(env, 'SUPABASE_URL'), 'SUPABASE_URL');
  if (new URL(supabaseUrl).hostname !== EXPECTED_SUPABASE_HOST) {
    throw new Error('SUPABASE_URL must point to the dedicated Fakturasjekk production project.');
  }

  const databaseUrl = required(env, 'DATABASE_URL');
  assertDedicatedSupabaseDatabase(databaseUrl, supabaseProjectRef);

  const privateStorageBucket = required(env, 'PRIVATE_STORAGE_BUCKET');
  if (privateStorageBucket !== EXPECTED_STORAGE_BUCKET) {
    throw new Error(`PRIVATE_STORAGE_BUCKET must be ${EXPECTED_STORAGE_BUCKET}.`);
  }

  const authIssuer = httpsEndpoint(required(env, 'AUTH_ISSUER'), 'AUTH_ISSUER');
  const expectedIssuer = `${supabaseUrl}/auth/v1`;
  if (authIssuer !== expectedIssuer) {
    throw new Error('AUTH_ISSUER must match the dedicated Fakturasjekk Supabase Auth issuer.');
  }

  const paymentProvider = required(env, 'PAYMENT_PROVIDER');
  const extractorProvider = required(env, 'DOCUMENT_EXTRACTOR_PROVIDER');
  const responseInterpreterProvider = required(env, 'RESPONSE_INTERPRETER_PROVIDER');
  for (const [name, value] of Object.entries({ PAYMENT_PROVIDER: paymentProvider, DOCUMENT_EXTRACTOR_PROVIDER: extractorProvider, RESPONSE_INTERPRETER_PROVIDER: responseInterpreterProvider })) {
    if (/^dev-|test|mock/i.test(value)) throw new Error(`${name} cannot use a development provider in production.`);
  }

  return {
    environment: 'production',
    app_origin: appOrigin,
    api_origin: apiOrigin,
    supabase_project_ref: supabaseProjectRef,
    supabase_url: supabaseUrl,
    database_url: databaseUrl,
    private_storage_bucket: privateStorageBucket,
    auth_issuer: authIssuer,
    auth_audience: required(env, 'AUTH_AUDIENCE'),
    payment_provider: paymentProvider,
    document_extractor_provider: extractorProvider,
    response_interpreter_provider: responseInterpreterProvider,
    encryption_key_id: required(env, 'ENCRYPTION_KEY_ID')
  };
}

export function publicProductionConfigSummary(config) {
  return {
    environment: config.environment,
    app_origin: config.app_origin,
    api_origin: config.api_origin,
    dedicated_supabase_project_locked: config.supabase_project_ref === EXPECTED_SUPABASE_PROJECT_REF,
    auth_issuer_configured: Boolean(config.auth_issuer),
    auth_audience_configured: Boolean(config.auth_audience),
    payment_provider_configured: Boolean(config.payment_provider),
    private_storage_configured: config.private_storage_bucket === EXPECTED_STORAGE_BUCKET,
    document_extractor_configured: Boolean(config.document_extractor_provider),
    response_interpreter_configured: Boolean(config.response_interpreter_provider),
    encryption_key_configured: Boolean(config.encryption_key_id),
    database_configured: Boolean(config.database_url)
  };
}

export function assertPublicConfigSafe(summary) {
  const text = JSON.stringify(summary ?? {});
  for (const forbidden of ['DATABASE_URL', 'database_url', 'SUPABASE_SECRET_KEY', 'PRIVATE_STORAGE_BUCKET', 'private_storage_bucket', 'ENCRYPTION_KEY_ID', 'encryption_key_id', 'secret', 'token', 'password']) {
    if (text.includes(forbidden)) throw new Error(`Sensitive production config leaked: ${forbidden}`);
  }
  return true;
}

export const PRODUCTION_SUPABASE_TARGET = Object.freeze({
  project_ref: EXPECTED_SUPABASE_PROJECT_REF,
  host: EXPECTED_SUPABASE_HOST,
  storage_bucket: EXPECTED_STORAGE_BUCKET
});
