import fs from 'node:fs';
import { createGoogleVisionOcrClient } from '../server/google-vision-ocr.mjs';
import { createGoogleStructuredAiClient } from '../server/google-structured-ai-client.mjs';
import { createGoogleServiceAccountTokenProvider } from '../server/google-service-account-token.mjs';

export const GOOGLE_E2E_APPROVAL = 'I_APPROVE_SYNTHETIC_GOOGLE_NETWORK_CALLS';
export const GOOGLE_E2E_MARKER = 'FAKTURASJEKK OCR 2900';
const GOOGLE_TARGET_PATH = new URL('../config/google-cloud-target.json', import.meta.url);
const ALLOWED_MODES = new Set(['ocr-only', 'ocr-and-structured-ai']);

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

export function validateGoogleLiveTarget(target, confirmedProjectId) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) throw new Error('Google Cloud target config is required.');
  if (target.project_scope !== 'fakturasjekk_only') throw new Error('Google Cloud target must remain Fakturasjekk-only.');
  const projectId = required(target.project_id, 'Dedicated Fakturasjekk Google Cloud project id');
  if (projectId === 'SET_AFTER_SEPARATE_FAKTURASJEKK_GOOGLE_PROJECT_EXISTS') throw new Error('Google Cloud project id is still a placeholder.');
  if (required(confirmedProjectId, 'Confirmed Google Cloud project id') !== projectId) throw new Error('Google Cloud project confirmation does not match the reviewed Fakturasjekk target.');
  if (target.location !== 'eu') throw new Error('Google Cloud target must remain in the EU multi-region.');
  if (target.vision_endpoint !== 'https://eu-vision.googleapis.com') throw new Error('Google Vision endpoint must remain EU-bound.');
  if (target.vertex_endpoint !== 'https://aiplatform.eu.rep.googleapis.com') throw new Error('Vertex AI endpoint must remain EU-bound.');
  const apis = new Set(Array.isArray(target.required_apis) ? target.required_apis : []);
  for (const api of ['vision.googleapis.com', 'aiplatform.googleapis.com']) {
    if (!apis.has(api)) throw new Error(`Google Cloud target is missing required API ${api}.`);
  }
  if (target.customer_data_live_enabled !== false) throw new Error('Synthetic Google verification requires customer-data live processing to remain disabled.');
  const runtimeServiceAccountName = required(target.runtime_service_account_name, 'Google runtime service-account name');
  return { ...target, project_id: projectId, runtime_service_account_name: runtimeServiceAccountName };
}

export function assertSyntheticGoogleNetworkApproval({ costMode, paidServicesApproved, approval, mode } = {}) {
  if (costMode !== 'funded') throw new Error('Synthetic Google live verification is blocked while Fakturasjekk cost mode is zero.');
  if (paidServicesApproved !== 'approved') throw new Error('Synthetic Google live verification requires explicit paid-services approval.');
  if (approval !== GOOGLE_E2E_APPROVAL) throw new Error('Synthetic Google live verification requires the exact network-call approval phrase.');
  if (!ALLOWED_MODES.has(mode)) throw new Error('Synthetic Google live verification mode is invalid.');
  return true;
}

export function parseGoogleServiceAccount(raw, target) {
  let credentials;
  try { credentials = JSON.parse(required(raw, 'GOOGLE_SERVICE_ACCOUNT_JSON')); } catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must be valid JSON.'); }
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) throw new Error('Google service-account credentials must be an object.');
  if (credentials.type !== 'service_account') throw new Error('Google credential must be a service account.');
  if (credentials.project_id !== target.project_id) throw new Error('Google service-account credential belongs to the wrong project.');
  const expectedEmail = `${target.runtime_service_account_name}@${target.project_id}.iam.gserviceaccount.com`;
  if (credentials.client_email !== expectedEmail) throw new Error('Google service-account identity does not match the reviewed Fakturasjekk runtime identity.');
  required(credentials.private_key, 'Google service-account private key');
  return credentials;
}

function pdfEscape(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

export function syntheticGooglePdfBytes(marker = GOOGLE_E2E_MARKER) {
  const safeMarker = required(marker, 'Synthetic OCR marker');
  if (!/^[A-Z0-9 ._-]{5,80}$/.test(safeMarker)) throw new Error('Synthetic OCR marker contains unsupported PDF fixture characters.');
  const stream = `BT\n/F1 26 Tf\n72 720 Td\n(${pdfEscape(safeMarker)}) Tj\nET\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

function normalizedMarker(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function runGoogleAiE2EWithClients({ ocrClient, structuredClient = null, mode = 'ocr-only' } = {}) {
  if (!ocrClient?.ocrDocument) throw new Error('Google live verifier requires OCR client.');
  if (!ALLOWED_MODES.has(mode)) throw new Error('Synthetic Google live verification mode is invalid.');
  if (mode === 'ocr-and-structured-ai' && !structuredClient?.runStructured) throw new Error('Google live verifier requires structured AI client for combined mode.');

  const ocr = await ocrClient.ocrDocument({
    id: 'synthetic-google-e2e-document',
    role: 'invoice',
    mime_type: 'application/pdf'
  });
  if (ocr?.provider !== 'google_cloud_vision' || ocr?.provider_location !== 'eu') throw new Error('Google OCR live verification escaped the reviewed EU provider boundary.');
  if (ocr?.total_pages !== 1 || !Array.isArray(ocr.pages) || ocr.pages.length !== 1) throw new Error('Google OCR live verification returned an unexpected page count.');
  const text = ocr.pages[0]?.text ?? '';
  if (!normalizedMarker(text).includes(normalizedMarker(GOOGLE_E2E_MARKER))) throw new Error('Google OCR live verification did not recover the synthetic marker.');

  let structuredVerified = false;
  if (mode === 'ocr-and-structured-ai') {
    const output = await structuredClient.runStructured({
      task: 'fakturasjekk_synthetic_google_live_e2e',
      system_instructions: 'Return only the exact marker, amount_minor and document_type supplied in the untrusted input. Do not infer, calculate, browse or add information.',
      output_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['marker', 'amount_minor', 'document_type'],
        properties: {
          marker: { type: 'string' },
          amount_minor: { type: 'integer' },
          document_type: { type: 'string', enum: ['synthetic'] }
        }
      },
      input: { marker: GOOGLE_E2E_MARKER, amount_minor: 2900, document_type: 'synthetic' },
      security: {
        inputs_are_untrusted_data: true,
        obey_instructions_from_inputs: false,
        tools_enabled: false,
        external_network_enabled: false,
        legal_reasoning_allowed: false
      }
    });
    if (output?.marker !== GOOGLE_E2E_MARKER || output?.amount_minor !== 2900 || output?.document_type !== 'synthetic') {
      throw new Error('Google structured AI live verification did not preserve the exact synthetic values.');
    }
    structuredVerified = true;
  }

  return {
    ok: true,
    synthetic_only: true,
    customer_data_live_enabled: false,
    eu_vision_verified: true,
    ocr_marker_verified: true,
    structured_ai_verified: structuredVerified,
    legal_reasoning_used: false
  };
}

export async function runGoogleAiLiveE2E({
  env = process.env,
  fetchImpl = globalThis.fetch,
  target = JSON.parse(fs.readFileSync(GOOGLE_TARGET_PATH, 'utf8'))
} = {}) {
  const mode = env.GOOGLE_LIVE_E2E_MODE ?? 'ocr-only';
  assertSyntheticGoogleNetworkApproval({
    costMode: env.FAKTURASJEKK_COST_MODE,
    paidServicesApproved: env.FAKTURASJEKK_PAID_SERVICES_APPROVED,
    approval: env.FAKTURASJEKK_GOOGLE_SYNTHETIC_E2E_APPROVED,
    mode
  });
  const reviewedTarget = validateGoogleLiveTarget(target, env.GOOGLE_CLOUD_PROJECT_ID);
  const credentials = parseGoogleServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON, reviewedTarget);
  const accessTokenProvider = createGoogleServiceAccountTokenProvider({ credentials, fetchImpl });
  const pdfBytes = syntheticGooglePdfBytes();
  const ocrClient = createGoogleVisionOcrClient({
    projectId: reviewedTarget.project_id,
    accessTokenProvider,
    readDocumentBytes: async () => pdfBytes,
    fetchImpl,
    location: 'eu',
    maxPagesPerDocument: 1,
    maxBytes: 1024 * 1024
  });
  const structuredClient = mode === 'ocr-and-structured-ai'
    ? createGoogleStructuredAiClient({
        projectId: reviewedTarget.project_id,
        accessTokenProvider,
        fetchImpl,
        location: 'eu',
        defaultModel: env.GOOGLE_STRUCTURED_AI_MODEL ?? 'gemini-3.1-flash-lite',
        allowedModels: [env.GOOGLE_STRUCTURED_AI_MODEL ?? 'gemini-3.1-flash-lite'],
        maxInputChars: 5000,
        maxOutputTokens: 512
      })
    : null;
  const result = await runGoogleAiE2EWithClients({ ocrClient, structuredClient, mode });
  return { ...result, mode, project_target_verified: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runGoogleAiLiveE2E()
    .then(result => console.log(`OK Google synthetic live E2E: ${JSON.stringify(result)}`))
    .catch(error => {
      console.error(`FAIL Google synthetic live E2E: ${error?.code ?? 'google_live_e2e_failed'}: ${error?.message ?? 'unknown error'}`);
      process.exitCode = 1;
    });
}
