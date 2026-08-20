import { ApiError } from './api-errors.mjs';
import { requireUser, requireCaseId, requireBodyObject, requireString } from './auth-policy.mjs';
import { projectCase, projectAnalysisResponse, projectDraftResponse, projectFullResult, assertNoPrivateFields } from './public-projection.mjs';

export function sanitizeCollectionContext(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return input.claim_disputed === true ? { claim_disputed: true } : null;
}

export function createCaseHandlers({ services, registry = null, idempotency = null, serviceDeliveryGate = null, clock = () => new Date() } = {}) {
  async function mutate(request, operation, fn) {
    if (!idempotency) return fn();
    const key = request?.headers?.['idempotency-key'] ?? request?.headers?.['Idempotency-Key'];
    return idempotency.run({ key, operation, owner_id: request.auth.user.id }, fn);
  }
  function safe(body) { assertNoPrivateFields(body); return body; }

  async function assertPaidDeliveryReady({ case_id, owner_id }) {
    if (serviceDeliveryGate?.assertReady) await serviceDeliveryGate.assertReady({ case_id, owner_id });
  }

  return {
    async create_case(request) {
      const user = requireUser(request);
      const body = requireBodyObject(request.body);
      if (!['consumer', 'business'].includes(body.buyer_type)) throw new ApiError(400, 'invalid_buyer_type', 'buyer_type må være consumer eller business.');
      const subject = requireString(body.subject, 'subject_required', 'Sakstype må oppgis.', { max: 80 });
      const retention_mode = body.retention_mode ?? 'temporary';
      if (!['temporary', 'saved_case'].includes(retention_mode)) throw new ApiError(400, 'invalid_retention_mode', 'Ugyldig lagringsvalg.');
      return mutate(request, 'create_case', async () => {
        const caseData = await services.createNewCase({ owner_id: user.id, buyer_type: body.buyer_type, subject, retention_mode });
        return { status: 201, body: safe(projectCase(caseData)) };
      });
    },

    async register_uploads(request) {
      const user = requireUser(request);
      const case_id = requireCaseId(request.params);
      const body = requireBodyObject(request.body);
      if (!Array.isArray(body.files)) throw new ApiError(400, 'files_required', 'files må være en liste.');
      return mutate(request, `register_uploads:${case_id}`, async () => {
        const output = await services.registerUploads({ case_id, owner_id: user.id, files: body.files });
        const response = { accepted: output.accepted, validation: output.validation, upload_targets: output.upload_targets ?? [], case: projectCase(output.case) };
        return { status: output.accepted ? 200 : 422, body: safe(response) };
      });
    },

    async confirm_document_upload(request) {
      const user = requireUser(request);
      const case_id = requireCaseId(request.params);
      const document_id = requireString(request.params?.document_id, 'invalid_document_id', 'Ugyldig dokument-ID.', { max: 128 });
      return mutate(request, `confirm_document_upload:${case_id}:${document_id}`, async () => {
        const output = await services.confirmDocumentUpload({ case_id, owner_id: user.id, document_id });
        const publicCase = projectCase(output.case);
        return { status: 200, body: safe({ uploaded: output.uploaded, document: publicCase.documents.find(d => d.id === document_id), case: publicCase }) };
      });
    },

    async analyze_case(request) {
      const user = requireUser(request);
      const case_id = requireCaseId(request.params);
      const body = request.body == null ? {} : requireBodyObject(request.body);
      return mutate(request, `analyze_case:${case_id}`, async () => {
        const output = await services.analyzeStoredCase({
          case_id,
          owner_id: user.id,
          user_note: typeof body.user_note === 'string' ? body.user_note.slice(0, 4000) : '',
          collection: sanitizeCollectionContext(body.collection)
        });
        return { status: 200, body: safe(projectAnalysisResponse(output)) };
      });
    },

    async full_result(request) {
      const user = requireUser(request);
      const case_id = requireCaseId(request.params);
      await assertPaidDeliveryReady({ case_id, owner_id: user.id });
      const result = await services.getFullResult({ case_id, owner_id: user.id });
      return { status: 200, body: projectFullResult(result, registry) };
    },

    async create_draft(request) {
      const user = requireUser(request);
      const case_id = requireCaseId(request.params);
      const body = request.body == null ? {} : requireBodyObject(request.body);
      return mutate(request, `create_draft:${case_id}`, async () => {
        await assertPaidDeliveryReady({ case_id, owner_id: user.id });
        const output = await services.saveGeneratedDraft({ case_id, owner_id: user.id, mode: body.mode ?? 'request' });
        return { status: 201, body: safe(projectDraftResponse(output)) };
      });
    },

    async retention_status(request) {
      const user = requireUser(request);
      const case_id = requireCaseId(request.params);
      return { status: 200, body: await services.retentionStatus({ case_id, owner_id: user.id, now: clock().toISOString() }) };
    }
  };
}
