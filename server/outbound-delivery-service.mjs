import { transitionCase } from '../engine/case-state.mjs';

const VALID_KINDS = new Set(['draft', 'follow_up']);

function requireValue(value, name) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function collectionFor(caseData, kind) {
  return kind === 'draft' ? (caseData.drafts ?? []) : (caseData.follow_ups ?? []);
}

function expectedState(kind) {
  return kind === 'draft' ? 'draft_ready' : 'follow_up_ready';
}

function matchingSentEvent(caseData, { kind, record_id }) {
  return [...(caseData.events ?? [])].reverse().find(event =>
    event?.type === 'OUTBOUND_SENT' &&
    event?.data?.kind === kind &&
    event?.data?.record_id === record_id
  ) ?? null;
}

export function createOutboundDeliveryService({ caseStore, clock = () => new Date() } = {}) {
  if (!caseStore?.getOwned || !caseStore?.save) throw new Error('Outbound delivery requires an owned case store with save support.');

  async function markSent({ case_id, owner_id, kind, record_id } = {}) {
    const caseId = requireValue(case_id, 'case_id');
    const ownerId = requireValue(owner_id, 'owner_id');
    const outboundKind = requireValue(kind, 'kind');
    const recordId = requireValue(record_id, 'record_id');
    if (!VALID_KINDS.has(outboundKind)) throw new Error('Outbound kind must be draft or follow_up.');

    let caseData = await caseStore.getOwned(caseId, ownerId);
    const record = collectionFor(caseData, outboundKind).find(item => item.id === recordId);
    if (!record) throw new Error('Outbound record not found in this case.');

    if (caseData.state === 'sent_to_supplier') {
      const existing = matchingSentEvent(caseData, { kind: outboundKind, record_id: recordId });
      if (existing) {
        return {
          sent: true,
          idempotent: true,
          kind: outboundKind,
          record_id: recordId,
          sent_at: existing.at,
          case: caseData
        };
      }
      throw new Error('Case already has a different outbound communication marked as sent.');
    }

    const requiredState = expectedState(outboundKind);
    if (caseData.state !== requiredState) {
      throw new Error(`Outbound ${outboundKind} cannot be marked sent from case state ${caseData.state}.`);
    }

    caseData = transitionCase(caseData, 'sent_to_supplier', {
      event_type: 'OUTBOUND_SENT',
      data: { kind: outboundKind, record_id: recordId },
      clock
    });
    await caseStore.save(caseData);
    const event = matchingSentEvent(caseData, { kind: outboundKind, record_id: recordId });
    return {
      sent: true,
      idempotent: false,
      kind: outboundKind,
      record_id: recordId,
      sent_at: event?.at ?? caseData.updated_at,
      case: caseData
    };
  }

  return { markSent };
}
