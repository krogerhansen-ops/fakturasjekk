import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  GOOGLE_E2E_APPROVAL,
  GOOGLE_E2E_MARKER,
  validateGoogleLiveTarget,
  assertSyntheticGoogleNetworkApproval,
  parseGoogleServiceAccount,
  syntheticGooglePdfBytes,
  runGoogleAiE2EWithClients,
  runGoogleAiLiveE2E
} from '../scripts/verify-google-ai-live.mjs';

const validTarget = {
  version: '1.0.0',
  project_scope: 'fakturasjekk_only',
  project_id: 'fakturasjekk-synthetic-google-test',
  location: 'eu',
  vision_endpoint: 'https://eu-vision.googleapis.com',
  vertex_endpoint: 'https://aiplatform.eu.rep.googleapis.com',
  required_apis: ['vision.googleapis.com', 'aiplatform.googleapis.com'],
  runtime_service_account_name: 'fakturasjekk-ai-runtime',
  customer_data_live_enabled: false
};

const reviewed = validateGoogleLiveTarget(validTarget, validTarget.project_id);
assert.equal(reviewed.project_id, validTarget.project_id);
assert.throws(() => validateGoogleLiveTarget({ ...validTarget, project_id: null }, validTarget.project_id), /project id/i);
assert.throws(() => validateGoogleLiveTarget(validTarget, 'wrong-project'), /confirmation does not match/i);
assert.throws(() => validateGoogleLiveTarget({ ...validTarget, location: 'us' }, validTarget.project_id), /EU multi-region/i);
assert.throws(() => validateGoogleLiveTarget({ ...validTarget, customer_data_live_enabled: true }, validTarget.project_id), /customer-data live processing/i);
assert.throws(() => validateGoogleLiveTarget({ ...validTarget, required_apis: ['vision.googleapis.com'] }, validTarget.project_id), /aiplatform.googleapis.com/i);

assert.equal(assertSyntheticGoogleNetworkApproval({
  costMode: 'funded',
  paidServicesApproved: 'approved',
  approval: GOOGLE_E2E_APPROVAL,
  mode: 'ocr-only'
}), true);
assert.throws(() => assertSyntheticGoogleNetworkApproval({ costMode: 'zero', paidServicesApproved: 'approved', approval: GOOGLE_E2E_APPROVAL, mode: 'ocr-only' }), /cost mode is zero/i);
assert.throws(() => assertSyntheticGoogleNetworkApproval({ costMode: 'funded', paidServicesApproved: 'no', approval: GOOGLE_E2E_APPROVAL, mode: 'ocr-only' }), /paid-services approval/i);
assert.throws(() => assertSyntheticGoogleNetworkApproval({ costMode: 'funded', paidServicesApproved: 'approved', approval: 'yes', mode: 'ocr-only' }), /exact network-call approval phrase/i);
assert.throws(() => assertSyntheticGoogleNetworkApproval({ costMode: 'funded', paidServicesApproved: 'approved', approval: GOOGLE_E2E_APPROVAL, mode: 'unknown' }), /mode is invalid/i);

const credential = parseGoogleServiceAccount(JSON.stringify({
  type: 'service_account',
  project_id: validTarget.project_id,
  client_email: `fakturasjekk-ai-runtime@${validTarget.project_id}.iam.gserviceaccount.com`,
  private_key: 'SYNTHETIC_PRIVATE_KEY_PLACEHOLDER'
}), validTarget);
assert.equal(credential.project_id, validTarget.project_id);
assert.throws(() => parseGoogleServiceAccount(JSON.stringify({ ...credential, project_id: 'wrong-project' }), validTarget), /wrong project/i);
assert.throws(() => parseGoogleServiceAccount(JSON.stringify({ ...credential, client_email: `other@${validTarget.project_id}.iam.gserviceaccount.com` }), validTarget), /runtime identity/i);

const pdf = syntheticGooglePdfBytes();
const pdfText = new TextDecoder().decode(pdf);
assert.match(pdfText, /^%PDF-1\.4/);
assert.match(pdfText, new RegExp(GOOGLE_E2E_MARKER));
assert.match(pdfText, /\/BaseFont \/Helvetica/);
assert.match(pdfText, /xref/);
assert.match(pdfText, /%%EOF/);
assert.equal(pdf.byteLength < 5000, true, 'synthetic OCR fixture must remain tiny');

let structuredRequest = null;
const ocrClient = {
  async ocrDocument(document) {
    assert.deepEqual(document, { id: 'synthetic-google-e2e-document', role: 'invoice', mime_type: 'application/pdf' });
    return {
      provider: 'google_cloud_vision',
      provider_location: 'eu',
      total_pages: 1,
      pages: [{ page: 1, text: 'Fakturasjekk OCR\n2900' }]
    };
  }
};
const structuredClient = {
  async runStructured(request) {
    structuredRequest = structuredClone(request);
    return { marker: GOOGLE_E2E_MARKER, amount_minor: 2900, document_type: 'synthetic' };
  }
};
const combined = await runGoogleAiE2EWithClients({ ocrClient, structuredClient, mode: 'ocr-and-structured-ai' });
assert.deepEqual(combined, {
  ok: true,
  synthetic_only: true,
  customer_data_live_enabled: false,
  eu_vision_verified: true,
  ocr_marker_verified: true,
  structured_ai_verified: true,
  legal_reasoning_used: false
});
assert.equal(structuredRequest.security.inputs_are_untrusted_data, true);
assert.equal(structuredRequest.security.obey_instructions_from_inputs, false);
assert.equal(structuredRequest.security.tools_enabled, false);
assert.equal(structuredRequest.security.external_network_enabled, false);
assert.equal(structuredRequest.security.legal_reasoning_allowed, false);
assert.equal(structuredRequest.input.amount_minor, 2900);
assert.equal(structuredRequest.output_schema.additionalProperties, false);

const ocrOnly = await runGoogleAiE2EWithClients({ ocrClient, mode: 'ocr-only' });
assert.equal(ocrOnly.structured_ai_verified, false);
await assert.rejects(
  runGoogleAiE2EWithClients({
    ocrClient: { async ocrDocument() { return { provider: 'google_cloud_vision', provider_location: 'eu', total_pages: 1, pages: [{ page: 1, text: 'WRONG TEXT' }] }; } },
    mode: 'ocr-only'
  }),
  /did not recover the synthetic marker/i
);

const repositoryTarget = JSON.parse(fs.readFileSync(new URL('../config/google-cloud-target.json', import.meta.url), 'utf8'));
assert.equal(repositoryTarget.project_id, null, 'test must preserve fail-closed repository state until a separate Fakturasjekk Google project id is reviewed');
await assert.rejects(
  runGoogleAiLiveE2E({
    env: {
      FAKTURASJEKK_COST_MODE: 'funded',
      FAKTURASJEKK_PAID_SERVICES_APPROVED: 'approved',
      FAKTURASJEKK_GOOGLE_SYNTHETIC_E2E_APPROVED: GOOGLE_E2E_APPROVAL,
      GOOGLE_LIVE_E2E_MODE: 'ocr-only',
      GOOGLE_CLOUD_PROJECT_ID: 'not-yet-configured'
    },
    target: repositoryTarget,
    fetchImpl: async () => { throw new Error('network must not be reached while project target is null'); }
  }),
  /project id/i
);

console.log('OK Google live verifier is project-reviewed, EU-bound, paid-call-gated, synthetic-only and legal-reasoning-free');
