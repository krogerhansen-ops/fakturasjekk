import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync(new URL('../.github/workflows/brevo-live-verification.yml', import.meta.url), 'utf8');
const target = JSON.parse(fs.readFileSync(new URL('../config/brevo-delivery-target.json', import.meta.url), 'utf8'));
const verifier = fs.readFileSync(new URL('../scripts/verify-brevo-live.mjs', import.meta.url), 'utf8');

assert.match(workflow, /^name: Fakturasjekk Brevo live verification/m);
assert.match(workflow, /workflow_dispatch:/);
assert.equal(/\n\s*push:/.test(workflow), false);
assert.equal(/\n\s*pull_request:/.test(workflow), false);
assert.equal(/\n\s*schedule:/.test(workflow), false);
assert.match(workflow, /default:\s*config-only/);
assert.match(workflow, /default:\s*zero/);
assert.match(workflow, /I_APPROVE_SYNTHETIC_BREVO_NETWORK_CALLS/);
assert.match(workflow, /Verify reviewed Brevo target before reading credentials/);
assert.ok(workflow.indexOf('validateBrevoLiveTarget') < workflow.indexOf('secrets.BREVO_API_KEY'));
assert.match(workflow, /if: \$\{\{ inputs\.mode == 'config-only' \}\}/);
assert.match(workflow, /if: \$\{\{ inputs\.mode == 'send-acceptance' \}\}/);
assert.match(workflow, /secrets\.BREVO_SYNTHETIC_RECIPIENT_EMAIL/);
assert.equal(workflow.includes('actions/upload-artifact'), false);
assert.equal(workflow.includes('SUPABASE_SECRET_KEY'), false);
assert.equal(workflow.includes('GOOGLE_SERVICE_ACCOUNT_JSON'), false);
assert.equal(workflow.includes('VIPPS_'), false);

assert.equal(target.provider, 'brevo');
assert.equal(target.webhook_url, null, 'repository target must remain unconfigured until a real reviewed webhook exists');
assert.equal(target.sender_email, null);
assert.equal(target.sender_domain, null);
assert.equal(target.customer_data_live_enabled, false);
assert.equal(target.synthetic_send_enabled, false, 'synthetic email send must require a separate reviewed config change');
assert.equal(target.webhook_batched, false);
assert.equal(target.webhook_header_name, 'x-fakturasjekk-brevo-secret');
for (const event of ['delivered', 'hardBounce', 'softBounce', 'blocked', 'spam', 'invalid', 'deferred']) {
  assert.ok(target.required_events.includes(event), `target missing required event ${event}`);
}

assert.match(verifier, /delivery_webhook_e2e_verified:\s*false/);
assert.match(verifier, /durable_medium_delivered:\s*false/);
assert.match(verifier, /synthetic_send_enabled/);
assert.match(verifier, /customer_data_live_enabled/);
assert.match(verifier, /local-part must contain synthetic or test/);
assert.equal(verifier.includes('console.log(apiKey'), false);
assert.equal(verifier.includes('console.log(webhookSecret'), false);

console.log('OK Brevo live workflow is manual, config-first, zero-cost-default, synthetic-only and cannot overclaim delivery.');
