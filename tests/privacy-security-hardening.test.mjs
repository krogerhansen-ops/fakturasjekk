import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { securityHeaders } from '../server/security-policy.mjs';
import { sanitizeAuditMetadata } from '../server/audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const text = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const privacy = json('config/privacy-security-policy.json');
const retention = json('config/retention-policy.json');
const gate = json('config/launch-gate.json');

assert.equal(privacy.tracking.nonessential_tracking_enabled, false);
assert.equal(privacy.tracking.advertising_profiling_enabled, false);
assert.equal(privacy.tracking.document_content_for_marketing, false);
assert.equal(privacy.special_categories.general_article9_basis_assumed, false);
assert.equal(privacy.special_categories.automated_analysis_on_detection, 'stop');
assert.equal(privacy.third_party_personal_data.contract_basis_must_not_be_used_as_blanket_basis, true);
assert.equal(privacy.ai_processing.provider_training_on_customer_content_allowed, false);
assert.equal(privacy.logging.document_text_allowed, false);
assert.equal(privacy.logging.access_tokens_allowed, false);
assert.equal(privacy.security_target.production_csp_required, true);
assert.equal(privacy.security_target.production_hsts_required, true);

assert.equal(retention.modes.temporary.source_documents_ttl_hours_after_completed_analysis, 24);
assert.equal(retention.modes.temporary.case_content_ttl_days_after_last_activity, 7);
assert.equal(retention.modes.saved_case.case_ttl_days_after_last_activity, 90);
assert.ok(retention.backup_requirements.ordinary_rotating_backup_max_days_product_requirement <= 35);
assert.equal(retention.backup_requirements.restore_must_reapply_deletion_ledger_before_user_access, true);
assert.equal(retention.backup_requirements.deleted_cases_must_not_be_reactivated_by_restore, true);
assert.equal(retention.security_audit.contains_document_content, false);

const requiredGateIds = [
  'LEGAL_DIGITALYTELSER_COMPLIANCE',
  'LEGAL_THIRD_PARTY_BASIS',
  'LEGAL_ARTICLE9_FAIL_CLOSED',
  'LEGAL_ROPA',
  'LEGAL_PROCESSOR_REGISTER',
  'TECH_ASVS_L2_BASELINE',
  'TECH_NO_NONESSENTIAL_TRACKING',
  'LEGAL_INCIDENT_RESPONSE'
];
const gateById = new Map(gate.checks.map(item => [item.id, item]));
for (const id of requiredGateIds) {
  assert.ok(gateById.has(id), `launch gate missing ${id}`);
  assert.equal(gateById.get(id).required, true, `${id} must be required`);
}
assert.equal(gateById.get('LEGAL_DPIA_COMPLETE').status, 'in_progress');
assert.equal(gateById.get('LEGAL_PROCESSOR_AGREEMENTS').status, 'todo');
assert.equal(gateById.get('LEGAL_TRANSFER_ASSESSMENT').status, 'todo');
assert.equal(gateById.get('TECH_DELETE_END_TO_END_TEST').status, 'todo');
assert.equal(gateById.get('TECH_BACKUP_RETENTION_TEST').status, 'todo');

const headers = securityHeaders({ production: true, sensitive: true });
assert.match(headers['content-security-policy'], /default-src 'none'/);
assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
assert.match(headers['strict-transport-security'], /max-age=/);
assert.equal(headers['x-content-type-options'], 'nosniff');
assert.equal(headers['referrer-policy'], 'no-referrer');
assert.equal(headers['cross-origin-opener-policy'], 'same-origin');
assert.equal(headers['cross-origin-resource-policy'], 'same-origin');
assert.match(headers['cache-control'], /no-store/);

const dirtyAudit = sanitizeAuditMetadata({
  status: 'ok',
  document_text: 'secret invoice text',
  raw_ocr: 'sensitive',
  user_note: 'private',
  supplier_response: 'private',
  generated_draft: 'private',
  access_token: 'token',
  refresh_token: 'token',
  storage_key: 'private/key',
  database_url: 'postgres://secret',
  amount_minor: 2900,
  currency: 'NOK'
});
assert.deepEqual(dirtyAudit, { status: 'ok', amount_minor: 2900, currency: 'NOK' });

for (const doc of [
  'docs/DIGITALYTELSER-COMPLIANCE.md',
  'docs/GDPR-THIRD-PARTY-AND-ARTICLE9.md',
  'docs/DPIA-2026-08-18.md',
  'docs/ROPA.md',
  'docs/PROCESSORS-AND-TRANSFERS.md',
  'docs/RETENTION-AND-DELETION-VERIFICATION.md',
  'docs/SECURITY-ASVS-L2-BASELINE.md',
  'docs/NO-TRACKING-AND-INCIDENT-RESPONSE.md'
]) {
  assert.ok(fs.existsSync(path.join(root, doc)), `missing hardening document ${doc}`);
}
assert.match(text('docs/GDPR-THIRD-PARTY-AND-ARTICLE9.md'), /Automatisk juridisk analyse skal stoppe/);
assert.match(text('docs/DPIA-2026-08-18.md'), /Risikoregister/);
assert.match(text('docs/ROPA.md'), /protokoll over behandlingsaktiviteter/i);
assert.match(text('docs/PROCESSORS-AND-TRANSFERS.md'), /BLOCKED/);
assert.match(text('docs/NO-TRACKING-AND-INCIDENT-RESPONSE.md'), /72 timer/);

const forbiddenMarkers = privacy.tracking.forbidden_v1_markers.map(v => v.toLowerCase());
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(abs);
    return [abs];
  });
}
for (const file of walk(path.join(root, 'site')).filter(f => /\.(html|js|mjs|css)$/i.test(f))) {
  const content = fs.readFileSync(file, 'utf8').toLowerCase();
  for (const marker of forbiddenMarkers) assert.equal(content.includes(marker), false, `non-essential tracker marker ${marker} found in ${path.relative(root, file)}`);
}

console.log('OK privacy/security hardening: digital services, GDPR bases, Article 9 fail-closed, DPIA/ROPA, processors/transfers, retention, ASVS baseline and no-tracking/incident controls.');
