import fs from 'node:fs';
import assert from 'node:assert/strict';

const review = fs.readFileSync(new URL('../docs/PROVIDER-PRIVACY-REVIEW-2026-08-22.md', import.meta.url), 'utf8');
const brevoTarget = JSON.parse(fs.readFileSync(new URL('../config/brevo-delivery-target.json', import.meta.url), 'utf8'));
const launchGate = JSON.parse(fs.readFileSync(new URL('../config/launch-gate.json', import.meta.url), 'utf8'));

assert.match(review, /Supabase.*DPA AVAILABLE.*TRANSFER REVIEW STILL OPEN/is);
assert.match(review, /Google Cloud.*MODEL-SPECIFIC LIVE REVIEW OPEN/is);
assert.match(review, /Vipps MobilePay.*independent controllers/is);
assert.match(review, /ePAYMENT ROLE CLARIFIED/is);
assert.match(review, /transactional_log_retention_months = 1/);
assert.match(review, /email_previews_enabled = false/);
assert.match(review, /PRIVACY SETTINGS NOW FAIL-CLOSED IN CODE/);
assert.match(review, /ikke.*LEGAL_PROCESSOR_AGREEMENTS.*complete/is);
assert.match(review, /ikke.*LEGAL_TRANSFER_ASSESSMENT.*complete/is);

assert.equal(brevoTarget.version, 2);
assert.equal(brevoTarget.transactional_log_retention_months, null, 'repository target must remain blocked until the live Brevo account is reviewed');
assert.equal(brevoTarget.email_previews_enabled, null, 'repository target must not claim preview storage is disabled before live account review');
assert.equal(brevoTarget.privacy_settings_verified_at, null);
assert.equal(brevoTarget.customer_data_live_enabled, false);
assert.equal(brevoTarget.synthetic_send_enabled, false);

for (const id of ['LEGAL_PROCESSOR_AGREEMENTS', 'LEGAL_TRANSFER_ASSESSMENT', 'LEGAL_DPIA_COMPLETE']) {
  const gate = launchGate.checks.find(item => item.id === id);
  assert.ok(gate, `Missing launch gate ${id}`);
  assert.notEqual(gate.status, 'complete', `${id} must remain open after provider desk review alone`);
}

console.log('OK provider privacy review clarifies roles and Brevo retention without falsely completing contract/transfer/DPIA gates');
