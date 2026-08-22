function safeLimit(value, fallback = 25) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function latestConfirmation(caseData) {
  const confirmations = caseData?.order_confirmations ?? [];
  return Array.isArray(confirmations) && confirmations.length ? confirmations.at(-1) : null;
}

function safeErrorCode(error) {
  const code = typeof error?.code === 'string' ? error.code.trim() : '';
  return code && /^[a-z0-9_:-]{1,80}$/i.test(code) ? code : 'order_confirmation_retry_failed';
}

export function createOrderConfirmationDeliveryRetryService({
  caseStore,
  deliveryService,
  audit = null,
  defaultLimit = 25
} = {}) {
  if (typeof caseStore?.listPendingOrderConfirmationDeliveries !== 'function') {
    throw new Error('Order confirmation retry requires listPendingOrderConfirmationDeliveries.');
  }
  if (typeof deliveryService?.deliverPrepared !== 'function') {
    throw new Error('Order confirmation retry requires a delivery service.');
  }
  const boundedDefault = safeLimit(defaultLimit);

  async function record({ case_id, confirmation_id, outcome, metadata = {} }) {
    if (!audit?.record) return true;
    try {
      await audit.record({
        actor_id: null,
        case_id,
        action: 'order_confirmation.retry',
        outcome,
        metadata: { confirmation_id, ...metadata }
      });
      return true;
    } catch {
      // Audit availability must never alter whether a provider-confirmed receipt
      // delivery or provider acceptance is reported as successful. The runner
      // exposes a separate count for operations.
      return false;
    }
  }

  async function run({ limit = boundedDefault } = {}) {
    const batchLimit = safeLimit(limit, boundedDefault);
    const candidates = await caseStore.listPendingOrderConfirmationDeliveries({ limit: batchLimit });
    const summary = {
      checked: candidates.length,
      delivered: 0,
      already_delivered: 0,
      awaiting_provider_confirmation: 0,
      skipped: 0,
      failed: 0,
      audit_failures: 0,
      errors: []
    };

    for (const candidate of candidates) {
      const confirmation = latestConfirmation(candidate);
      const confirmationId = confirmation?.confirmation_id ?? null;
      if (!candidate?.id || !candidate?.owner_id || !confirmationId || confirmation?.durable_medium_delivered === true) {
        summary.skipped += 1;
        continue;
      }

      try {
        const result = await deliveryService.deliverPrepared({
          case_id: candidate.id,
          owner_id: candidate.owner_id,
          confirmation_id: confirmationId
        });
        if (result?.delivered === true) {
          if (result?.idempotent === true) summary.already_delivered += 1;
          else summary.delivered += 1;
          const audited = await record({
            case_id: candidate.id,
            confirmation_id: confirmationId,
            outcome: 'success',
            metadata: {
              status: result?.idempotent === true ? 'already_delivered' : 'delivered'
            }
          });
          if (!audited) summary.audit_failures += 1;
        } else if (result?.accepted === true && result?.pending_provider_confirmation === true) {
          summary.awaiting_provider_confirmation += 1;
          const audited = await record({
            case_id: candidate.id,
            confirmation_id: confirmationId,
            outcome: 'provider_accepted',
            metadata: { status: 'awaiting_provider_confirmation' }
          });
          if (!audited) summary.audit_failures += 1;
        } else {
          summary.failed += 1;
          summary.errors.push({
            case_id: candidate.id,
            confirmation_id: confirmationId,
            error_code: 'order_confirmation_delivery_unconfirmed'
          });
          const audited = await record({
            case_id: candidate.id,
            confirmation_id: confirmationId,
            outcome: 'failed',
            metadata: { error_code: 'order_confirmation_delivery_unconfirmed' }
          });
          if (!audited) summary.audit_failures += 1;
        }
      } catch (error) {
        const errorCode = safeErrorCode(error);
        summary.failed += 1;
        summary.errors.push({
          case_id: candidate.id,
          confirmation_id: confirmationId,
          error_code: errorCode
        });
        const audited = await record({
          case_id: candidate.id,
          confirmation_id: confirmationId,
          outcome: 'failed',
          metadata: { error_code: errorCode }
        });
        if (!audited) summary.audit_failures += 1;
      }
    }

    return {
      ...summary,
      ok: summary.failed === 0 && summary.audit_failures === 0,
      limit: batchLimit,
      has_more_possible: candidates.length === batchLimit
    };
  }

  return { run };
}
