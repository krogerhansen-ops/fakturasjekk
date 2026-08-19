import { agreementConfirmationPayload } from './checkout-consent.mjs';

function nowIso(clock) {
  const value = typeof clock === 'function' ? clock() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Agreement confirmation clock is invalid.');
  return date.toISOString();
}

function latestCheckoutConsent(caseData) {
  const items = Array.isArray(caseData?.checkout_consents) ? caseData.checkout_consents : [];
  return items.at(-1) ?? null;
}

function updateConsent(caseData, consentId, patch, event) {
  const index = (caseData.checkout_consents ?? []).findIndex(item => item.id === consentId);
  if (index < 0) throw new Error('Checkout consent not found for agreement confirmation.');
  const checkout_consents = [...caseData.checkout_consents];
  checkout_consents[index] = { ...checkout_consents[index], ...patch };
  return {
    ...caseData,
    checkout_consents,
    updated_at: event.at,
    events: [...(caseData.events ?? []), event]
  };
}

export function isAgreementConfirmationDelivered(caseData, checkoutPolicy) {
  if (!checkoutPolicy) return true;
  if (checkoutPolicy.requirements?.durable_confirmation_required_before_service_delivery !== true) return true;
  const consent = latestCheckoutConsent(caseData);
  if (!consent) return false;
  if (consent.checkout_policy_version !== checkoutPolicy.version) return false;
  if (Number(consent.amount_minor) !== Number(checkoutPolicy.product?.amount_minor) || consent.currency !== checkoutPolicy.product?.currency) return false;
  return consent.durable_medium_status === 'delivered' && typeof consent.durable_medium_delivered_at === 'string' && !Number.isNaN(Date.parse(consent.durable_medium_delivered_at));
}

export function createAgreementConfirmationService({
  caseStore,
  provider,
  checkoutPolicy,
  clock = () => new Date()
} = {}) {
  if (!caseStore?.getForSystem || !caseStore?.save) throw new Error('Agreement confirmation service requires caseStore getForSystem/save.');
  if (!provider?.sendAgreementConfirmation || !provider?.verifyWebhook) throw new Error('Agreement confirmation provider requires sendAgreementConfirmation/verifyWebhook.');
  if (!checkoutPolicy || typeof checkoutPolicy !== 'object') throw new Error('Agreement confirmation checkout policy is required.');

  async function sendForPaidCase({ case_id }) {
    let caseData = await caseStore.getForSystem(case_id);
    if (!['paid','draft_ready','sent_to_supplier','supplier_response_received','follow_up_ready','resolved','closed'].includes(caseData.state)) {
      throw new Error('Agreement confirmation can only be sent after verified payment.');
    }
    const consent = latestCheckoutConsent(caseData);
    if (!consent?.id || consent.valid !== true) throw new Error('Paid case is missing validated checkout consent.');
    if (consent.checkout_policy_version !== checkoutPolicy.version) throw new Error('Paid case checkout policy version is stale.');
    if (!consent.delivery_email) throw new Error('Paid case is missing agreement confirmation email.');

    if (consent.durable_medium_status === 'delivered' && consent.durable_medium_delivered_at) {
      return { sent: true, delivered: true, duplicate: true, message_id: consent.durable_medium_message_id ?? null };
    }
    if (consent.durable_medium_message_id && ['sent','pending','deferred'].includes(consent.durable_medium_status)) {
      return { sent: true, delivered: false, duplicate: true, message_id: consent.durable_medium_message_id };
    }

    const payload = agreementConfirmationPayload({
      policy: checkoutPolicy,
      consent_record: consent,
      case_id: caseData.id,
      created_at: consent.accepted_at
    });
    const result = await provider.sendAgreementConfirmation({
      case_id: caseData.id,
      checkout_consent_id: consent.id,
      delivery_email: consent.delivery_email,
      agreement_confirmation_payload: payload
    });
    if (!result?.provider_accepted || !result?.message_id) throw new Error('Agreement confirmation provider did not accept the message.');

    const at = nowIso(clock);
    caseData = updateConsent(caseData, consent.id, {
      durable_medium_provider: result.provider,
      durable_medium_message_id: result.message_id,
      durable_medium_status: 'sent',
      durable_medium_sent_at: at,
      durable_medium_delivered_at: null,
      durable_medium_failed_at: null,
      durable_medium_failure_event: null
    }, {
      type: 'AGREEMENT_CONFIRMATION_SENT',
      at,
      data: { checkout_consent_id: consent.id, provider: result.provider, message_id: result.message_id }
    });
    await caseStore.save(caseData);
    return { sent: true, delivered: false, duplicate: false, message_id: result.message_id };
  }

  async function processWebhook({ headers, raw_body }) {
    const verified = provider.verifyWebhook({ headers, raw_body });
    if (!verified?.authenticated) {
      const error = new Error('Agreement confirmation webhook could not be authenticated.');
      error.code = 'invalid_email_webhook';
      throw error;
    }
    let caseData = await caseStore.getForSystem(verified.case_id);
    const consent = (caseData.checkout_consents ?? []).find(item => item.id === verified.checkout_consent_id);
    if (!consent) throw new Error('Agreement confirmation webhook references unknown checkout consent.');
    if (!consent.durable_medium_message_id || consent.durable_medium_message_id !== verified.message_id) {
      const error = new Error('Agreement confirmation webhook message id does not match the case.');
      error.code = 'email_webhook_message_conflict';
      throw error;
    }

    const at = nowIso(clock);
    if (verified.event === 'delivered') {
      if (consent.durable_medium_status === 'delivered') return { accepted: true, delivered: true, duplicate: true };
      caseData = updateConsent(caseData, consent.id, {
        durable_medium_status: 'delivered',
        durable_medium_delivered_at: at,
        durable_medium_provider_event_at: verified.provider_event_at ?? null,
        durable_medium_failed_at: null,
        durable_medium_failure_event: null
      }, {
        type: 'AGREEMENT_CONFIRMATION_DELIVERED',
        at,
        data: { checkout_consent_id: consent.id, provider: verified.provider, message_id: verified.message_id }
      });
      await caseStore.save(caseData);
      return { accepted: true, delivered: true, duplicate: false };
    }

    const terminalFailure = new Set(['hard_bounce','blocked','invalid','error']);
    const nextStatus = terminalFailure.has(verified.event) ? 'failed' : verified.event;
    caseData = updateConsent(caseData, consent.id, {
      durable_medium_status: nextStatus,
      ...(terminalFailure.has(verified.event) ? {
        durable_medium_failed_at: at,
        durable_medium_failure_event: verified.event
      } : {})
    }, {
      type: terminalFailure.has(verified.event) ? 'AGREEMENT_CONFIRMATION_FAILED' : 'AGREEMENT_CONFIRMATION_STATUS',
      at,
      data: { checkout_consent_id: consent.id, provider: verified.provider, message_id: verified.message_id, status: nextStatus }
    });
    await caseStore.save(caseData);
    return { accepted: true, delivered: false, duplicate: false, status: nextStatus };
  }

  return { sendForPaidCase, processWebhook };
}
