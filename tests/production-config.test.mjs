import assert from 'node:assert/strict';
import { loadProductionConfig, publicProductionConfigSummary, assertPublicConfigSafe, PRODUCTION_SUPABASE_TARGET } from '../server/production-config.mjs';

const ref = 'jxmkaxwflouacuboaetg';
const env = {
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://fakturasjekk.no',
  API_ORIGIN: 'https://api.fakturasjekk.no',
  SUPABASE_PROJECT_REF: ref,
  SUPABASE_URL: `https://${ref}.supabase.co`,
  DATABASE_URL: `postgresql://postgres:secret-pass@db.${ref}.supabase.co:5432/postgres`,
  PRIVATE_STORAGE_BUCKET: 'case-documents-private',
  AUTH_ISSUER: `https://${ref}.supabase.co/auth/v1`,
  AUTH_AUDIENCE: 'authenticated',
  PAYMENT_PROVIDER: 'provider-x',
  DOCUMENT_EXTRACTOR_PROVIDER: 'extractor-x',
  RESPONSE_INTERPRETER_PROVIDER: 'interpreter-x',
  ENCRYPTION_KEY_ID: 'key-prod-1'
};

const config = loadProductionConfig(env);
assert.equal(config.environment, 'production');
assert.equal(config.app_origin, 'https://fakturasjekk.no');
assert.equal(config.supabase_project_ref, ref);
assert.equal(config.auth_issuer, `https://${ref}.supabase.co/auth/v1`);
assert.equal(config.auth_audience, 'authenticated');
assert.equal(PRODUCTION_SUPABASE_TARGET.project_ref, ref);

const summary = publicProductionConfigSummary(config);
assert.equal(summary.database_configured, true);
assert.equal(summary.private_storage_configured, true);
assert.equal(summary.auth_audience_configured, true);
assert.equal(summary.dedicated_supabase_project_locked, true);
assertPublicConfigSafe(summary);
const publicText = JSON.stringify(summary);
assert.equal(publicText.includes('secret-pass'), false);
assert.equal(publicText.includes('case-documents-private'), false);
assert.equal(publicText.includes('key-prod-1'), false);
assert.equal(publicText.includes('authenticated'), false);

const otherRef = 'aaaaaaaaaaaaaaaaaaaa';
assert.throws(() => loadProductionConfig({ ...env, NODE_ENV: 'development' }), /NODE_ENV=production/i);
assert.throws(() => loadProductionConfig({ ...env, APP_ORIGIN: 'http://fakturasjekk.no' }), /HTTPS/i);
assert.throws(() => loadProductionConfig({ ...env, SUPABASE_PROJECT_REF: otherRef }), /dedicated Fakturasjekk/i);
assert.throws(() => loadProductionConfig({ ...env, SUPABASE_URL: `https://${otherRef}.supabase.co` }), /SUPABASE_URL/i);
assert.throws(() => loadProductionConfig({ ...env, DATABASE_URL: `postgresql://postgres:pw@db.${otherRef}.supabase.co:5432/postgres` }), /dedicated Fakturasjekk/i);
assert.throws(() => loadProductionConfig({ ...env, DATABASE_URL: 'mysql://db' }), /PostgreSQL/i);
assert.throws(() => loadProductionConfig({ ...env, PRIVATE_STORAGE_BUCKET: 'some-other-bucket' }), /case-documents-private/i);
assert.throws(() => loadProductionConfig({ ...env, AUTH_ISSUER: `https://${otherRef}.supabase.co/auth/v1` }), /AUTH_ISSUER/i);
assert.throws(() => loadProductionConfig({ ...env, PAYMENT_PROVIDER: 'dev-pay' }), /development provider/i);
assert.throws(() => loadProductionConfig({ ...env, DOCUMENT_EXTRACTOR_PROVIDER: '' }), /DOCUMENT_EXTRACTOR_PROVIDER/i);
assert.throws(() => loadProductionConfig({ ...env, AUTH_AUDIENCE: '' }), /AUTH_AUDIENCE/i);

const poolerEnv = {
  ...env,
  DATABASE_URL: `postgresql://postgres.${ref}:secret-pass@aws-0-eu-north-1.pooler.supabase.com:6543/postgres`
};
assert.equal(loadProductionConfig(poolerEnv).supabase_project_ref, ref);

console.log('OK production config is locked to the dedicated Fakturasjekk Supabase project');
