export const PRICE_NOK = 29;
export const PRICE_MINOR = 2900;
export const CURRENCY = 'NOK';

export function paymentRequirement({ case_id, product }) {
  if (!case_id) throw new Error('case_id is required');
  if (Number(product?.price_nok) !== PRICE_NOK) throw new Error('Product price mismatch. Expected 29 NOK.');
  if (product?.full_check_free !== false) throw new Error('Full check must not be configured as free.');
  return {
    case_id,
    amount_minor: PRICE_MINOR,
    amount_nok: PRICE_NOK,
    currency: CURRENCY,
    description: 'Full fakturasjekk + utkast til innsigelse',
    access_grant: 'full_check_and_objection_draft'
  };
}

export function validatePaymentConfirmation(confirmation, requirement) {
  const errors = [];
  if (!confirmation?.provider_reference) errors.push('Mangler betalingsreferanse fra leverandør.');
  if (confirmation?.case_id !== requirement.case_id) errors.push('Betalingen tilhører ikke riktig sak.');
  if (Number(confirmation?.amount_minor) !== requirement.amount_minor) errors.push('Betalt beløp stemmer ikke med 29 kr-produktet.');
  if (confirmation?.currency !== requirement.currency) errors.push('Valuta stemmer ikke.');
  if (confirmation?.status !== 'paid') errors.push('Betalingen er ikke bekreftet som betalt.');
  if (confirmation?.verified_server_side !== true) errors.push('Betalingen må verifiseres server-side før tilgang gis.');

  return {
    valid: errors.length === 0,
    errors,
    grant_access: errors.length === 0,
    payment_record: errors.length ? null : {
      id: confirmation.provider_reference,
      case_id: requirement.case_id,
      amount_nok: requirement.amount_nok,
      amount_minor: requirement.amount_minor,
      currency: requirement.currency,
      status: 'paid',
      provider: confirmation.provider ?? 'unknown',
      provider_reference: confirmation.provider_reference,
      verified_server_side: true,
      paid_at: confirmation.paid_at ?? null
    }
  };
}

export function shouldUnlockFullResult({ payment_validation, product }) {
  return payment_validation?.valid === true &&
    payment_validation?.grant_access === true &&
    Number(product?.price_nok) === PRICE_NOK &&
    product?.full_check_free === false;
}
