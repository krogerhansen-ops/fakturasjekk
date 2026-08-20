function isoDate(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!match) return null;
  const ms = Date.parse(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10) === match[1] ? match[1] : null;
}

function daysBetween(from, to) {
  const start = isoDate(from);
  const end = isoDate(to);
  if (!start || !end) return null;
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}

function sourceBacked(field, facts, origins) {
  if (facts[field] === undefined || facts[field] === null || facts[field] === '') return false;
  const origin = origins?.[field];
  if (!origin?.source_id) return false;
  return origin.type === 'documented' || origin.type === 'user_provided';
}

function stageFromDocuments(documents = []) {
  const roles = new Set(documents.map(document => document.role));
  if (roles.has('payment_request')) return 'payment_request';
  if (roles.has('collection_notice')) return 'collection_notice';
  if (roles.has('reminder')) return 'reminder';
  return 'none';
}

function take(field, targetField, context, facts, origins) {
  if (!sourceBacked(field, facts, origins)) return;
  context[targetField ?? field] = facts[field];
  context._fact_origins[targetField ?? field] = origins[field];
}

export function buildCollectionContext({ facts = {}, origins = {}, documents = [], user_collection = null } = {}) {
  const stage = stageFromDocuments(documents);
  if (stage === 'none') return null;

  const context = {
    stage,
    _fact_origins: {},
    _construction: 'server_from_source_backed_facts'
  };

  take('collection_document_sent_date', 'notice_sent_date', context, facts, origins);
  take('collection_payment_deadline_date', 'payment_deadline_date', context, facts, origins);
  take('reminder_fee', null, context, facts, origins);
  take('collection_notice_fee', null, context, facts, origins);
  take('payment_request_fee', null, context, facts, origins);
  take('collection_costs', null, context, facts, origins);
  take('collection_mode', null, context, facts, origins);
  take('stated_delay_interest_rate_percent', null, context, facts, origins);
  take('interest_rate_date', null, context, facts, origins);
  take('interest_basis', null, context, facts, origins);
  take('claim_dispute_date', null, context, facts, origins);

  const deadlineDays = daysBetween(context.notice_sent_date, context.payment_deadline_date);
  if (deadlineDays !== null) {
    context.payment_deadline_days = deadlineDays;
    context._fact_origins.payment_deadline_days = {
      type: 'calculated',
      source_id: context._fact_origins.notice_sent_date?.source_id ?? context._fact_origins.payment_deadline_date?.source_id ?? null,
      confidence: 'deterministic',
      note: 'Beregnet kalenderdifferanse mellom dokumentert utsendelsesdato og dokumentert betalingsfrist.'
    };
  }

  if (user_collection?.claim_disputed === true) {
    context.claim_disputed = true;
    context._fact_origins.claim_disputed = {
      type: 'user_provided',
      source_id: null,
      confidence: null,
      note: 'Brukeren opplyser at hovedkravet er bestridt. Dette er kontekst og ikke dokumentbevis alene.'
    };
  }

  const disputeDate = isoDate(context.claim_dispute_date);
  const sentDate = isoDate(context.notice_sent_date);
  if (disputeDate) {
    context.claim_disputed = true;
    context.dispute_documentation_provided = true;
    context._fact_origins.claim_disputed = context._fact_origins.claim_dispute_date;
    context._fact_origins.dispute_documentation_provided = context._fact_origins.claim_dispute_date;
  }

  if (disputeDate && sentDate && sentDate > disputeDate && ['collection_notice', 'payment_request'].includes(stage)) {
    context.ordinary_collection_continues = true;
    context._fact_origins.ordinary_collection_continues = {
      type: 'calculated',
      source_id: context._fact_origins.notice_sent_date?.source_id ?? null,
      confidence: 'deterministic',
      note: `Dokumentert innsigelse ${disputeDate} ligger før dokumentert ${stage === 'payment_request' ? 'betalingsoppfordring' : 'inkassovarsel'} ${sentDate}.`
    };
  }

  return context;
}

export function collectionContextPublicSummary(context) {
  if (!context) return null;
  const { _fact_origins, _construction, ...publicContext } = context;
  return {
    ...publicContext,
    source_backed: _construction === 'server_from_source_backed_facts'
  };
}
