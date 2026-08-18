import assert from 'node:assert/strict';
import { loadProductionConfig, publicProductionConfigSummary, assertPublicConfigSafe } from '../server/production-config.mjs';

const env = {
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://fakturasjekk.no',
  API_ORIGIN: 'https://api.fakturasjekk.no',
  DATABASE_URL: 'postgresql://secret-user:secret-pass@db.internal/fakturasjekk',
  PRIVATE_STORAGE_BUCKET: 'private-prod-bucket',
  AUTH_ISSUER: 'https://auth.fakturasjekk.no',
  AUTH_AUDIENCE: 'fakturasjekk-api',
  PAYMENT_PROVIDER: 'provider-x',
  DOCUMENT_EXTRACTOR_PROVIDER: 'extractor-x',
  RESPONSE_INTERPRETER_PROVIDER: 'interpreter-x',
  ENCRYPTION_KEY_ID: 'key-prod-1'
};
const config = loadProductionConfig(env);
assert.equal(config.environment, 'production');
assert.equal(config.app_origin, 'https://fakturasjekk.no');
assert.equal(config.auth_audience, 'fakturasjekk-api');
const summary = publicProductionConfigSummary(config);
assert.equal(summary.database_configured, true);
assert.equal(summary.private_storage_configured, true);
assert.equal(summary.auth_audience_configured, true);
assertPublicConfigSafe(summary);
const publicText = JSON.stringify(summary);
assert.equal(publicText.includes('secret-pass'), false);
assert.equal(publicText.includes('private-prod-bucket'), false);
assert.equal(publicText.includes('key-prod-1'), false);
assert.equal(publicText.includes('fakturasjekk-api'), false);

assert.throws(() => loadProductionConfig({ ...env, NODE_ENV: 'development' }), /NODE_ENV=production/i);
assert.throws(() => loadProductionConfig({ ...env, APP_ORIGIN: 'http://fakturasjekk.no' }), /HTTPS/i);
assert.throws(() => loadProductionConfig({ ...env, DATABASE_URL: 'mysql://db' }), /PostgreSQL/i);
assert.throws(() => loadProductionConfig({ ...env, PAYMENT_PROVIDER: 'dev-pay' }), /development provider/i);
assert.throws(() => loadProductionConfig({ ...env, DOCUMENT_EXTRACTOR_PROVIDER: '' }), /DOCUMENT_EXTRACTOR_PROVIDER/i);
assert.throws(() => loadProductionConfig({ ...env, AUTH_AUDIENCE: '' }), /AUTH_AUDIENCE/i);

console.log('OK production config');
