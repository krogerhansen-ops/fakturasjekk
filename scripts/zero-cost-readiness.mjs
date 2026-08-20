import fs from 'node:fs';
import { evaluateZeroCostMode } from '../server/zero-cost-mode.mjs';
import { evaluateRuleSafety } from '../engine/rule-safety.mjs';

function readJson(path) {
  return JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
}

const product = readJson('../config/product.json');
const registry = readJson('../rules/rules.json');
const retention = readJson('../config/retention-policy.json');
const extraction = readJson('../config/extraction-fields.json');

const env = {
  FAKTURASJEKK_COST_MODE: process.env.FAKTURASJEKK_COST_MODE || 'zero',
  FAKTURASJEKK_PAID_SERVICES_APPROVED: process.env.FAKTURASJEKK_PAID_SERVICES_APPROVED || 'no',
  CUSTOMER_UPLOAD_ENABLED: process.env.CUSTOMER_UPLOAD_ENABLED || 'false',
  PRODUCTION_API_ENABLED: process.env.PRODUCTION_API_ENABLED || 'false',
  PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER || 'unset',
  DOCUMENT_EXTRACTOR_PROVIDER: process.env.DOCUMENT_EXTRACTOR_PROVIDER || 'manual',
  RESPONSE_INTERPRETER_PROVIDER: process.env.RESPONSE_INTERPRETER_PROVIDER || 'synthetic',
  VIPPS_ENVIRONMENT: process.env.VIPPS_ENVIRONMENT || 'test'
};

const cost = evaluateZeroCostMode(env);
const ruleSafety = evaluateRuleSafety(registry, { now: new Date(), max_age_days: 30 });

const checks = [
  ['price_29', Number(product.price_nok) === 29 && product.full_check_free === false],
  ['demo_free_only', product.demo_free === true && product.mode === 'external_test'],
  ['public_upload_off', product.production_upload_enabled === false && env.CUSTOMER_UPLOAD_ENABLED === 'false'],
  ['cost_guard_safe', cost.safe === true && cost.zero_cost === true],
  ['rules_runtime_safe', ruleSafety.usable === true && ruleSafety.active_count > 0],
  ['manual_extraction_contract_present', Boolean(extraction.version) && Object.keys(extraction.fields ?? {}).length > 0],
  ['temporary_retention_default', retention.modes?.temporary?.default === true],
  ['temporary_source_docs_24h', Number(retention.modes?.temporary?.source_documents_ttl_hours_after_completed_analysis) <= 24],
  ['temporary_case_content_7d', Number(retention.modes?.temporary?.case_content_ttl_days_after_last_activity) <= 7],
  ['saved_case_opt_in', retention.modes?.saved_case?.requires_explicit_user_choice === true],
  ['restore_safety_required', retention.backup_requirements?.restore_must_reapply_deletion_ledger_before_user_access === true]
].map(([name, ok]) => ({ name, ok: ok === true }));

const failed = checks.filter(check => !check.ok);
const report = {
  status: failed.length ? 'not_ready' : 'ready_for_zero_cost_internal_development',
  ready: failed.length === 0,
  failed_count: failed.length,
  checks,
  rule_safety: {
    active_count: ruleSafety.active_count,
    blocked_count: ruleSafety.blocked_count,
    blocked_ids: ruleSafety.blocked_ids
  },
  intentionally_blocked_until_funded: [
    'public_customer_upload',
    'paid_ocr_or_ai',
    'production_payment',
    'production_customer_api'
  ]
};

console.log(JSON.stringify(report, null, 2));
if (!report.ready) process.exitCode = 2;
