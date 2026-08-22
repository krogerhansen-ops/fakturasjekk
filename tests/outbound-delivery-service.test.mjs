import assert from 'node:assert/strict';
import { createMemoryCaseStore } from '../server/reference-adapters.mjs';
import { createOutboundDeliveryService } from '../server/outbound-delivery-service.mjs';
import { createCase, transitionCase, addDraft, addFollowUp } from '../engine/case-state.mjs';

const fixed = new Date('2026-08-22T06:30:00.000Z');
const clock = () => fixed.toISOString();
const store = createMemoryCaseStore();
const delivery = createOutboundDeliveryService({ caseStore: store, clock });

function advance(caseData, states) {
  return states.reduce((current, next) => transitionCase(current, next, { clock }), caseData);
}

let draftCase = createCase({ id: 'case-draft', owner_id: 'owner-1', clock });
draftCase = advance(draftCase, ['documents_ready', 'analysis_ready', 'paid']);
draftCase = addDraft(draftCase, { id: 'draft-1', mode: 'request', text: 'Jeg ber om dokumentasjon.' }, { clock });
draftCase = transitionCase(draftCase, 'draft_ready', { clock });
await store.save(draftCase);

const first = await delivery.markSent({ case_id: 'case-draft', owner_id: 'owner-1', kind: 'draft', record_id: 'draft-1' });
assert.equal(first.sent, true);
assert.equal(first.idempotent, false);
assert.equal(first.case.state, 'sent_to_supplier');
assert.equal(first.case.events.at(-1).type, 'OUTBOUND_SENT');
assert.deepEqual(first.case.events.at(-1).data, { from: 'draft_ready', to: 'sent_to_supplier', kind: 'draft', record_id: 'draft-1' });

const eventCount = first.case.events.length;
const retry = await delivery.markSent({ case_id: 'case-draft', owner_id: 'owner-1', kind: 'draft', record_id: 'draft-1' });
assert.equal(retry.idempotent, true, 'same outbound record must be safe to retry even with a new idempotency key');
assert.equal(retry.case.events.length, eventCount, 'idempotent retry must not append a second sent event');

await assert.rejects(
  () => delivery.markSent({ case_id: 'case-draft', owner_id: 'other-owner', kind: 'draft', record_id: 'draft-1' }),
  /not found|owned/i
);

let followCase = createCase({ id: 'case-follow', owner_id: 'owner-1', clock });
followCase = advance(followCase, ['documents_ready', 'analysis_ready', 'paid']);
followCase = addDraft(followCase, { id: 'draft-2', mode: 'request', text: 'Første innsigelse.' }, { clock });
followCase = advance(followCase, ['draft_ready', 'sent_to_supplier', 'supplier_response_received']);
followCase = addFollowUp(followCase, { id: 'follow-1', response_id: 'response-1', text: 'Oppfølging.' }, { clock });
followCase = transitionCase(followCase, 'follow_up_ready', { clock });
await store.save(followCase);

const followSent = await delivery.markSent({ case_id: 'case-follow', owner_id: 'owner-1', kind: 'follow_up', record_id: 'follow-1' });
assert.equal(followSent.case.state, 'sent_to_supplier');
assert.equal(followSent.case.events.at(-1).data.kind, 'follow_up');
assert.equal(followSent.case.events.at(-1).data.record_id, 'follow-1');

let earlyCase = createCase({ id: 'case-early', owner_id: 'owner-1', clock });
earlyCase = addDraft(earlyCase, { id: 'draft-early', text: 'Ikke klar.' }, { clock });
await store.save(earlyCase);
await assert.rejects(
  () => delivery.markSent({ case_id: 'case-early', owner_id: 'owner-1', kind: 'draft', record_id: 'draft-early' }),
  /cannot be marked sent from case state draft/i
);

await assert.rejects(
  () => delivery.markSent({ case_id: 'case-follow', owner_id: 'owner-1', kind: 'follow_up', record_id: 'missing' }),
  /outbound record not found/i
);

console.log('OK outbound delivery lifecycle: draft/follow-up sent transition, ownership and retry safety');
