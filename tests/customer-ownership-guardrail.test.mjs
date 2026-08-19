import assert from 'node:assert/strict';
import { createCaseHandlers } from '../server/case-handlers.mjs';
import { createFactConfirmationHandlers } from '../server/fact-confirmation-handlers.mjs';
import { createSupplierResponseHandlers } from '../server/supplier-response-handlers.mjs';
import { createPaymentHandlers } from '../server/payment-handlers.mjs';
import { createManagementHandlers } from '../server/management-handlers.mjs';

const trustedOwner = '11111111-1111-4111-8111-111111111111';
const attackerOwner = '99999999-9999-4999-8999-999999999999';
const stop = new Error('STOP_AFTER_OWNER_CAPTURE');

function recorder() {
  const calls = [];
  return {
    calls,
    capture(name) {
      return async args => {
        calls.push({ name, args: structuredClone(args) });
        throw stop;
      };
    }
  };
}

function authRequest(extra = {}) {
  return {
    auth: { user: { id: trustedOwner } },
    params: { case_id: 'case-1', document_id: 'doc-1' },
    headers: {},
    body: {},
    ...extra
  };
}

async function expectCaptured(action, expectedName, expectedRecorder) {
  await assert.rejects(action, error => error === stop);
  const call = expectedRecorder.calls.at(-1);
  assert.equal(call?.name, expectedName);
  assert.equal(call?.args?.owner_id, trustedOwner, `${expectedName} must use authenticated user as owner`);
  assert.notEqual(call?.args?.owner_id, attackerOwner);
  return call.args;
}

const caseRec = recorder();
const caseServices = {
  createNewCase: caseRec.capture('createNewCase'),
  registerUploads: caseRec.capture('registerUploads'),
  confirmDocumentUpload: caseRec.capture('confirmDocumentUpload'),
  analyzeStoredCase: caseRec.capture('analyzeStoredCase'),
  getFullResult: caseRec.capture('getFullResult'),
  saveGeneratedDraft: caseRec.capture('saveGeneratedDraft'),
  retentionStatus: caseRec.capture('retentionStatus')
};
const caseHandlers = createCaseHandlers({ services: caseServices });

await expectCaptured(
  () => caseHandlers.create_case(authRequest({ body: { buyer_type: 'consumer', subject: 'Bilverksted', owner_id: attackerOwner } })),
  'createNewCase',
  caseRec
);
await expectCaptured(
  () => caseHandlers.register_uploads(authRequest({ body: { files: [], owner_id: attackerOwner } })),
  'registerUploads',
  caseRec
);
await expectCaptured(
  () => caseHandlers.confirm_document_upload(authRequest({ body: { owner_id: attackerOwner } })),
  'confirmDocumentUpload',
  caseRec
);
await expectCaptured(
  () => caseHandlers.analyze_case(authRequest({ body: { owner_id: attackerOwner, user_note: 'syntetisk' } })),
  'analyzeStoredCase',
  caseRec
);
await expectCaptured(
  () => caseHandlers.full_result(authRequest({ body: { owner_id: attackerOwner } })),
  'getFullResult',
  caseRec
);
await expectCaptured(
  () => caseHandlers.create_draft(authRequest({ body: { owner_id: attackerOwner, mode: 'request' } })),
  'saveGeneratedDraft',
  caseRec
);
await expectCaptured(
  () => caseHandlers.retention_status(authRequest({ body: { owner_id: attackerOwner } })),
  'retentionStatus',
  caseRec
);

const factRec = recorder();
const factHandlers = createFactConfirmationHandlers({ services: { confirmFacts: factRec.capture('confirmFacts') } });
await expectCaptured(
  () => factHandlers.confirm_facts(authRequest({ body: { owner_id: attackerOwner, items: [{ field: 'invoice_total', value: 100 }] } })),
  'confirmFacts',
  factRec
);

const responseRec = recorder();
const supplierHandlers = createSupplierResponseHandlers({ supplierResponseService: { processText: responseRec.capture('processText') } });
await expectCaptured(
  () => supplierHandlers.supplier_response(authRequest({ body: { owner_id: attackerOwner, response_text: 'Syntetisk svar' } })),
  'processText',
  responseRec
);

const paymentRec = recorder();
const paymentHandlers = createPaymentHandlers({
  services: { getPaymentRequirement: paymentRec.capture('getPaymentRequirement') },
  gateway: { async createSession() { throw new Error('must not reach gateway before owner-scoped requirement'); } },
  checkoutConsentService: { async acceptForPaymentSession() { throw new Error('must not reach consent before owner-scoped requirement'); } },
  allowedReturnOrigins: ['https://fakturasjekk.no']
});
await expectCaptured(
  () => paymentHandlers.payment_requirement(authRequest({ body: { owner_id: attackerOwner } })),
  'getPaymentRequirement',
  paymentRec
);
await expectCaptured(
  () => paymentHandlers.create_payment_session(authRequest({ body: { owner_id: attackerOwner } })),
  'getPaymentRequirement',
  paymentRec
);

const managementRec = recorder();
const managementHandlers = createManagementHandlers({
  management: {
    listCases: managementRec.capture('listCases'),
    deleteCase: managementRec.capture('deleteCase')
  }
});
await expectCaptured(
  () => managementHandlers.list_cases(authRequest({ body: { owner_id: attackerOwner } })),
  'listCases',
  managementRec
);
await expectCaptured(
  () => managementHandlers.delete_case(authRequest({ body: { owner_id: attackerOwner } })),
  'deleteCase',
  managementRec
);

// No authenticated user means service code must never be reached.
const before = caseRec.calls.length;
await assert.rejects(
  () => caseHandlers.analyze_case({ params: { case_id: 'case-1' }, body: {}, headers: {} }),
  error => error?.code === 'authentication_required' || /Innlogging kreves/.test(String(error?.message))
);
assert.equal(caseRec.calls.length, before, 'unauthenticated request must stop before service access');

console.log(`OK customer ownership guardrail: ${caseRec.calls.length + factRec.calls.length + responseRec.calls.length + paymentRec.calls.length + managementRec.calls.length} customer operations derive owner_id only from authenticated user.`);
