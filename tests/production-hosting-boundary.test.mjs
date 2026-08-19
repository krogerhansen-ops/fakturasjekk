import fs from 'node:fs';
import assert from 'node:assert/strict';

const hosting = JSON.parse(fs.readFileSync(new URL('../config/hosting-target.json', import.meta.url), 'utf8'));
const gate = JSON.parse(fs.readFileSync(new URL('../config/launch-gate.json', import.meta.url), 'utf8'));
const pagesWorkflow = fs.readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8').toLowerCase();

assert.equal(hosting.demo.provider, 'github_pages');
assert.equal(hosting.demo.purpose, 'synthetic_demo_only');
assert.equal(hosting.demo.commercial_transactions_allowed, false);
assert.equal(hosting.demo.customer_documents_allowed, false);
assert.equal(hosting.demo.payments_allowed, false);

assert.equal(hosting.production_frontend.provider, 'cloudflare_pages');
assert.equal(hosting.production_frontend.plan, 'free');
assert.equal(hosting.production_frontend.fixed_monthly_cost_nok, 0);
assert.equal(hosting.production_frontend.static_assets_only, true);
assert.equal(hosting.production_frontend.pages_functions_required, false);
assert.equal(hosting.production_frontend.custom_domain_required, true);
assert.equal(hosting.production_frontend.deployed, false, 'production frontend must stay closed until domain, auth redirects and E2E are verified');

assert.equal(hosting.production_backend.provider, 'supabase');
assert.equal(hosting.production_backend.project_ref, 'jxmkaxwflouacuboaetg');
assert.equal(hosting.production_backend.region, 'eu-north-1');
assert.equal(hosting.production_backend.customer_api_enabled, false);
assert.equal(hosting.production_backend.customer_upload_enabled, false);

const hostingGate = gate.checks.find(check => check.id === 'TECH_PRODUCTION_HOSTING');
assert.ok(hostingGate, 'TECH_PRODUCTION_HOSTING launch gate is required');
assert.notEqual(hostingGate.status, 'complete', 'production hosting may not be complete before Cloudflare/custom-domain deployment');

assert.match(pagesWorkflow, /index-launch-candidate\.html/);
assert.equal(pagesWorkflow.includes('fakturasjekk-api'), false, 'GitHub Pages demo workflow must never deploy the customer API');
assert.equal(pagesWorkflow.includes('vipps'), false, 'GitHub Pages demo workflow must never deploy payment credentials or payment runtime');

for (const url of Object.values(hosting.policy_sources)) {
  assert.match(url, /^https:\/\//);
}

console.log('OK demo and commercial production hosting remain explicitly separated');
