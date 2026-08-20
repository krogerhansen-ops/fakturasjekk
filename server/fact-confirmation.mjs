const CONFIRMABLE_FIELDS = new Set([
  'invoice_total', 'invoice_number', 'agreed_price', 'invoice_fee', 'price_basis',
  'invoice_fee_agreed', 'surcharge_documented', 'price_increase_after_start', 'customer_notified',
  'industry', 'regulated_sector', 'vehicle_service_context', 'transaction_nature', 'financing_detected'
]);

function validValue(value, definition = {}) {
  switch (definition.type) {
    case 'number': return Number.isFinite(Number(value));
    case 'string': return typeof value === 'string' && value.trim().length > 0;
    case 'boolean': return typeof value === 'boolean';
    case 'enum': return typeof value === 'string' && (definition.values ?? []).includes(value);
    default: return false;
  }
}

export function requiredFieldsForDocuments(documents = []) {
  const roles = new Set(documents.map(d => d.role));
  const required = ['invoice_total', 'invoice_number'];
  if (['quote', 'agreement', 'order_confirmation'].some(role => roles.has(role))) required.push('agreed_price');
  return required;
}

export function confirmationNeeds({ validated, documents = [], confirmations = {} } = {}) {
  const needs = [];
  const byField = new Map((validated?.review ?? []).map(item => [item.field, item]));
  for (const item of validated?.review ?? []) {
    if (!confirmations[item.field]) needs.push({ field: item.field, reason: item.reason, suggested_value: item.value, confidence: item.confidence, source_document_id: item.source_document_id, source_page: item.source_page });
  }
  const required = requiredFieldsForDocuments(documents);
  for (const field of required) {
    if (validated?.accepted?.[field] || byField.has(field) || confirmations[field]) continue;
    needs.push({ field, reason: 'Nødvendig felt kunne ikke leses sikkert fra dokumentene.', suggested_value: null, confidence: null, source_document_id: null, source_page: null });
  }
  return needs;
}

export function validateFactConfirmations({ items = [], catalog, documents = [], allowedNeeds = [] } = {}) {
  if (!Array.isArray(items) || items.length === 0) return { valid: false, confirmations: {}, errors: ['Minst én bekreftelse må oppgis.'] };
  const allowed = new Set(allowedNeeds.map(item => item.field));
  const documentIds = new Set(documents.map(d => d.id));
  const confirmations = {};
  const errors = [];

  for (const item of items) {
    const field = item?.field;
    const definition = catalog?.fields?.[field];
    if (!CONFIRMABLE_FIELDS.has(field) || !definition) { errors.push(`Felt kan ikke bekreftes manuelt: ${field ?? 'mangler'}`); continue; }
    if (!allowed.has(field)) { errors.push(`Feltet er ikke markert for avklaring: ${field}`); continue; }
    if (confirmations[field]) { errors.push(`Duplikat bekreftelse: ${field}`); continue; }
    if (item.confirmed_by_user !== true) { errors.push(`Eksplisitt brukerbekreftelse mangler for ${field}.`); continue; }
    if (!validValue(item.value, definition)) { errors.push(`Ugyldig verdi for ${field}.`); continue; }
    if (definition.positive_only === true && item.value !== true) { errors.push(`Feltet ${field} kan bare bekreftes som true når dette eksplisitt fremgår av kilden.`); continue; }
    if (!item.source_document_id || !documentIds.has(item.source_document_id)) { errors.push(`Gyldig kildedokument mangler for ${field}.`); continue; }
    const page = Number(item.source_page);
    if (!Number.isInteger(page) || page < 1 || page > 10000) { errors.push(`Gyldig sidenummer mangler for ${field}.`); continue; }
    confirmations[field] = {
      value: item.value,
      source_document_id: item.source_document_id,
      source_page: page,
      confirmed_by_user: true
    };
  }
  return { valid: errors.length === 0, confirmations, errors };
}

export function mergeConfirmedFacts({ validated, confirmations = {}, documents = [] } = {}) {
  const facts = {};
  const origins = {};
  for (const [field, item] of Object.entries(validated?.accepted ?? {})) {
    facts[field] = item.value;
    origins[field] = { type: 'documented', source_id: item.source_document_id, confidence: item.confidence, note: `Dokumentside ${item.source_page}` };
  }
  for (const [field, item] of Object.entries(confirmations)) {
    facts[field] = item.value;
    origins[field] = {
      type: 'user_provided',
      source_id: item.source_document_id,
      confidence: null,
      note: `Brukeren bekreftet egen avlesning fra dokument ${item.source_document_id}, side ${item.source_page}. Ikke maskinelt dokumentert.`
    };
  }
  const unresolved = confirmationNeeds({ validated, documents, confirmations });
  const hardRejected = (validated?.rejected ?? []).filter(item => item.field === 'extractor_contract');
  return { facts, origins, unresolved, hard_rejected: hardRejected, safe_to_continue: unresolved.length === 0 && hardRejected.length === 0 };
}
