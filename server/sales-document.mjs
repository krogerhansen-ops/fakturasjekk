function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function iso(value, field) {
  const parsed = Date.parse(value);
  if (!value || !Number.isFinite(parsed)) {
    const error = new Error(`${field} must be a valid timestamp.`);
    error.code = 'sales_document_invalid_input';
    error.field = field;
    throw error;
  }
  return new Date(parsed).toISOString();
}

function integerMinor(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    const error = new Error(`${field} must be a non-negative integer amount in minor units.`);
    error.code = 'sales_document_invalid_input';
    error.field = field;
    throw error;
  }
  return number;
}

export function salesDocumentReadiness(policy = {}) {
  const missing = [];
  if (policy.enabled !== true) missing.push('policy.enabled');
  for (const field of ['legal_name', 'organization_number', 'postal_address']) {
    if (!text(policy.seller?.[field])) missing.push(`seller.${field}`);
  }
  if (policy.seller?.ready !== true) missing.push('seller.ready');
  if (policy.numbering?.mode !== 'adapter_controlled_sequence' || policy.numbering?.require_atomic_next_number !== true) missing.push('numbering.atomic_sequence');
  if (policy.retention?.must_be_separate_from_case_retention !== true || Number(policy.retention?.minimum_years_after_financial_year_end) < 5) missing.push('retention.accounting_material');

  const vat = policy.vat_treatment ?? {};
  if (!['registered_standard', 'not_registered'].includes(vat.status)) missing.push('vat_treatment.status');
  if (vat.status === 'registered_standard') {
    if (policy.seller?.registered_in_vat !== true) missing.push('seller.registered_in_vat');
    if (!(Number(vat.rate_percent) > 0)) missing.push('vat_treatment.rate_percent');
  }
  if (vat.status === 'not_registered' && policy.seller?.registered_in_vat === true) missing.push('vat_treatment.conflict');

  return { ready: missing.length === 0, missing };
}

export function assertSalesDocumentReady(policy = {}) {
  const readiness = salesDocumentReadiness(policy);
  if (!readiness.ready) {
    const error = new Error('Sales document configuration is not ready.');
    error.code = 'sales_document_not_ready';
    error.missing = readiness.missing;
    throw error;
  }
  return readiness;
}

export function calculateGrossVat({ gross_minor, rate_percent }) {
  const gross = integerMinor(gross_minor, 'gross_minor');
  const rate = Number(rate_percent);
  if (!(rate > 0)) throw Object.assign(new Error('VAT rate must be positive.'), { code: 'sales_document_invalid_input', field: 'rate_percent' });
  const vat_minor = Math.round(gross * rate / (100 + rate));
  return { gross_minor: gross, net_minor: gross - vat_minor, vat_minor, rate_percent: rate };
}

export function buildSalesDocument({
  policy,
  document_number,
  issued_at,
  service_delivered_at,
  payment_due_at,
  paid_at,
  payment_provider,
  payment_provider_reference,
  buyer,
  product_name,
  amount_minor,
  case_reference = null
} = {}) {
  assertSalesDocumentReady(policy);
  const number = text(document_number);
  if (!number) throw Object.assign(new Error('Sales document number is required.'), { code: 'sales_document_invalid_input', field: 'document_number' });
  const buyerName = text(buyer?.name);
  const buyerAddress = text(buyer?.postal_address);
  if (!buyerName || !buyerAddress) throw Object.assign(new Error('Buyer name and postal address are required.'), { code: 'buyer_identity_required' });
  const gross = integerMinor(amount_minor, 'amount_minor');
  const currency = policy.currency ?? 'NOK';
  const issuedAt = iso(issued_at, 'issued_at');
  const deliveredAt = iso(service_delivered_at, 'service_delivered_at');
  const dueAt = iso(payment_due_at, 'payment_due_at');
  const paidAt = iso(paid_at, 'paid_at');

  const vat = policy.vat_treatment.status === 'registered_standard'
    ? calculateGrossVat({ gross_minor: gross, rate_percent: policy.vat_treatment.rate_percent })
    : null;

  return Object.freeze({
    schema_version: 1,
    document_type: 'sales_document',
    document_number: number,
    issued_at: issuedAt,
    case_reference: text(case_reference),
    seller: Object.freeze({
      legal_name: text(policy.seller.legal_name),
      organization_number: text(policy.seller.organization_number),
      postal_address: text(policy.seller.postal_address),
      organization_form: text(policy.seller.organization_form),
      registered_in_business_register: policy.seller.registered_in_business_register === true,
      registered_in_vat: policy.seller.registered_in_vat === true
    }),
    buyer: Object.freeze({ name: buyerName, postal_address: buyerAddress }),
    delivery: Object.freeze({
      description: text(product_name) ?? 'Full Fakturasjekk + utkast til innsigelse',
      quantity: 1,
      delivered_at: deliveredAt,
      delivery_place: 'digital levering til kjøper'
    }),
    payment: Object.freeze({
      amount_minor: gross,
      amount_nok: gross / 100,
      currency,
      payment_due_at: dueAt,
      paid_at: paidAt,
      status: 'paid',
      provider: text(payment_provider),
      provider_reference: text(payment_provider_reference)
    }),
    vat: vat ? Object.freeze({
      treatment: 'registered_standard',
      rate_percent: vat.rate_percent,
      net_minor: vat.net_minor,
      vat_minor: vat.vat_minor,
      gross_minor: vat.gross_minor
    }) : Object.freeze({ treatment: 'not_registered', rate_percent: null, net_minor: gross, vat_minor: null, gross_minor: gross }),
    retention: Object.freeze({
      class: policy.retention.class,
      minimum_years_after_financial_year_end: Number(policy.retention.minimum_years_after_financial_year_end),
      separate_from_case_retention: true,
      immutable_after_issue: policy.retention.immutable_after_issue === true
    }),
    policy_version: policy.version
  });
}
