import { ApiError } from './api-errors.mjs';

export function createPaymentProviderGateway({ provider, product, allowed_providers = [] } = {}) {
  if (!provider?.name || !provider?.createPayment || !provider?.verifyWebhook) {
    throw new Error('Payment provider requires name, createPayment and verifyWebhook.');
  }
  if (allowed_providers.length && !allowed_providers.includes(provider.name)) {
    throw new Error(`Payment provider is not allowlisted: ${provider.name}`);
  }

  async function createSession({ case_id, owner_id, requirement, return_url }) {
    if (Number(requirement?.amount_minor) !== 2900 || requirement?.currency !== 'NOK') {
      throw new Error('Payment gateway received unexpected product price.');
    }
    const result = await provider.createPayment({
      case_id,
      owner_id,
      amount_minor: requirement.amount_minor,
      currency: requirement.currency,
      description: requirement.description,
      return_url,
      metadata: { case_id }
    });
    if (!result?.provider_reference || !result?.checkout_url) throw new Error('Payment provider returned incomplete session.');
    if (!/^https:\/\//i.test(result.checkout_url)) throw new Error('Payment checkout URL must use HTTPS.');
    return {
      provider: provider.name,
      checkout_url: result.checkout_url,
      expires_at: result.expires_at ?? null
    };
  }

  async function verifyEvent({ headers, raw_body }) {
    const verified = await provider.verifyWebhook({ headers, raw_body });
    if (!verified?.signature_valid) throw new ApiError(401, 'invalid_payment_webhook', 'Betalingshendelsen kunne ikke verifiseres.');
    if (!verified?.case_id || !verified?.provider_reference) throw new ApiError(400, 'invalid_payment_event', 'Betalingshendelsen mangler nødvendig saksreferanse.');
    return {
      case_id: verified.case_id,
      payment_reference: verified.payment_reference ?? null,
      amount_minor: Number(verified.amount_minor),
      currency: verified.currency,
      status: verified.status,
      event_name: verified.event_name ?? null,
      operation_success: verified.operation_success !== false,
      provider: provider.name,
      provider_reference: verified.provider_reference,
      verified_server_side: true,
      paid_at: verified.paid_at ?? null
    };
  }

  async function captureAuthorized({ confirmation }) {
    if (!provider?.capturePayment) throw new Error('Payment provider does not support server-side capture.');
    if (confirmation?.status !== 'authorized' || confirmation?.operation_success !== true) {
      throw new Error('Only a successful authorized payment can be captured.');
    }
    if (Number(confirmation.amount_minor) !== 2900 || confirmation.currency !== 'NOK') {
      throw new Error('Authorized payment does not match the 29 NOK product.');
    }
    return provider.capturePayment({
      case_id: confirmation.case_id,
      payment_reference: confirmation.payment_reference,
      amount_minor: 2900,
      currency: 'NOK'
    });
  }

  async function pollPayment({ case_id }) {
    if (!provider?.getPayment) throw new Error('Payment provider does not support payment polling.');
    return provider.getPayment({ case_id });
  }

  return { provider_name: provider.name, createSession, verifyEvent, captureAuthorized, pollPayment };
}

export function createDevelopmentPaymentProvider({ name = 'dev-pay' } = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('Development payment provider cannot run in production.');
  return {
    name,
    async createPayment({ case_id }) {
      return {
        provider_reference: `dev-${case_id}`,
        checkout_url: `https://pay.fakturasjekk.test/${encodeURIComponent(case_id)}`,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      };
    },
    async verifyWebhook({ raw_body }) {
      const event = typeof raw_body === 'string' ? JSON.parse(raw_body) : raw_body;
      return {
        signature_valid: event?.signature === 'dev-valid-signature',
        case_id: event?.case_id,
        payment_reference: event?.payment_reference ?? null,
        provider_reference: event?.provider_reference,
        amount_minor: event?.amount_minor,
        currency: event?.currency,
        status: event?.status,
        event_name: event?.event_name ?? null,
        operation_success: event?.operation_success !== false,
        paid_at: event?.paid_at
      };
    }
  };
}
