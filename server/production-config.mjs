function required(env, name) {
  const value = env?.[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing production configuration: ${name}`);
  return value.trim();
}

function httpsUrl(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`Invalid URL in ${name}`); }
  if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS in production.`);
  return url.origin;
}

export function loadProductionConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') throw new Error('Production config may only be loaded with NODE_ENV=production.');
  const appOrigin = httpsUrl(required(env, 'APP_ORIGIN'), 'APP_ORIGIN');
  const apiOrigin = httpsUrl(required(env, 'API_ORIGIN'), 'API_ORIGIN');
  const databaseUrl = required(env, 'DATABASE_URL');
  if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) throw new Error('DATABASE_URL must be PostgreSQL.');

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
    database_url: databaseUrl,
    private_storage_bucket: required(env, 'PRIVATE_STORAGE_BUCKET'),
    auth_issuer: httpsUrl(required(env, 'AUTH_ISSUER'), 'AUTH_ISSUER'),
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
    auth_issuer_origin: config.auth_issuer,
    payment_provider_configured: Boolean(config.payment_provider),
    private_storage_configured: Boolean(config.private_storage_bucket),
    document_extractor_configured: Boolean(config.document_extractor_provider),
    response_interpreter_configured: Boolean(config.response_interpreter_provider),
    encryption_key_configured: Boolean(config.encryption_key_id),
    database_configured: Boolean(config.database_url)
  };
}

export function assertPublicConfigSafe(summary) {
  const text = JSON.stringify(summary ?? {});
  for (const forbidden of ['DATABASE_URL', 'database_url', 'PRIVATE_STORAGE_BUCKET', 'private_storage_bucket', 'ENCRYPTION_KEY_ID', 'encryption_key_id', 'secret', 'token', 'password']) {
    if (text.includes(forbidden)) throw new Error(`Sensitive production config leaked: ${forbidden}`);
  }
  return true;
}
