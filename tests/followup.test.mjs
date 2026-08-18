import fs from 'node:fs';
import assert from 'node:assert/strict';
import { analyzeCase } from '../engine/analyzer.mjs';
import { reviewSupplierResponse, buildFollowUpDraft } from '../engine/followup.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));

const original = analyzeCase({
  party_type: 'consumer',
  case_type: 'handcraft_service',
  price_basis: 'estimate',
  agreed_price: 120000,
  invoice_total: 146000,
  invoice_fee: 500,
  surcharge_documented: false,
  lines: [
    { description: 'Arbeid', quantity: 1, unit_price: 141500 },
    { description: 'Servicebil', quantity: 1, unit_price: 2000 },
    { description: 'Servicebil', quantity: 1, unit_price: 2000 },
    { description: 'Fakturagebyr', quantity: 1, unit_price: 500 }
  ]
}, registry);

const review = reviewSupplierResponse({
  original_analysis: original,
  registry,
  response: {
    items: [
      {
        finding_code: 'HANDCRAFT_INVOICE_FEE',
        coverage: 'answered',
        answer_text: 'Fakturagebyret er kreditert og ny faktura blir sendt.',
        documentation_required: false,
        documentation_provided: false
      },
      {
        finding_code: 'ESTIMATE_ABOVE_15_CONTROL',
        coverage: 'partial',
        answer_text: 'Det ble mer arbeid enn først antatt.',
        documentation_required: true,
        documentation_provided: false
      }
    ]
  }
});

assert.equal(review.allowed, true);
assert.equal(review.status, 'follow_up_recommended');
assert.ok(review.answered_count >= 1);
assert.ok(review.partially_answered_count >= 1);
assert.ok(review.unanswered_count >= 1);

const feeItem = review.items.find(i => i.finding_code === 'HANDCRAFT_INVOICE_FEE');
assert.equal(feeItem.status, 'answered');
assert.ok(feeItem.active_rule_references.some(r => r.includes('§ 36')));

const estimateItem = review.items.find(i => i.finding_code === 'ESTIMATE_ABOVE_15_CONTROL');
assert.equal(estimateItem.status, 'partial');
assert.ok(estimateItem.explanation.includes('dokumentasjon'));

const followUp = buildFollowUpDraft({ review, invoice_reference: '12345', user_note: 'Jeg ber om dato for når tilleggsarbeidet ble avtalt.' });
assert.equal(followUp.allowed, true);
assert.ok(followUp.text.includes('faktura 12345'));
assert.ok(followUp.text.includes('Tilleggsopplysning fra meg:'));
assert.equal(followUp.text.includes('Fakturagebyr i håndverkertjeneste'), false, 'answered item should not be repeated');
assert.equal(/HTJL_|FKJL_|POF_|BOF_|INK_/.test(followUp.text), false, 'internal rule ids must not leak');

const answeredAll = reviewSupplierResponse({
  original_analysis: {
    findings: [{ code: 'X', title: 'Punkt', rule_ids: [] }]
  },
  registry,
  response: {
    items: [{ finding_code: 'X', coverage: 'answered', answer_text: 'Dette er nå korrigert i vedlagte kreditnota.', documentation_required: false }]
  }
});
assert.equal(answeredAll.status, 'all_points_answered');
assert.equal(buildFollowUpDraft({ review: answeredAll }).allowed, false);

const noOriginal = reviewSupplierResponse({ original_analysis: { findings: [] }, registry });
assert.equal(noOriginal.allowed, false);

console.log('OK: follow-up engine tracks answered/partial/unanswered findings and generates a second response only for unresolved points.');
