import assert from 'node:assert/strict';
import { projectFullResult, assertNoPrivateFields } from '../server/public-projection.mjs';

const registry = { rules: [{ id: 'HTJL_32_PRICE_ESTIMATE', law: 'håndverkertjenesteloven', section: '§ 32', title: 'Prisoverslag', source_url: 'https://lovdata.no/test', last_verified: '2026-08-18', status: 'active' }] };
const internal = {
  status: 'attention',
  engine: '0.44.0',
  analysis: {
    calculations: { difference: 26000 },
    findings: [{ code: 'ESTIMATE_ABOVE_15_CONTROL', severity: 'high', title: 'Fakturaen overstiger kontrollnivået', explanation: 'Må vurderes mot mulig pristillegg.', rule_ids: ['HTJL_32_PRICE_ESTIMATE'] }],
    rule_ids: ['HTJL_32_PRICE_ESTIMATE'],
    questions: ['Er tilleggsarbeidet dokumentert?']
  },
  evidence: [
    { type: 'documented', field: 'invoice_total', value: 146000, source_id: 'doc-1', confidence: 0.99, note: 'Dokumentside 1' },
    { type: 'rule', field: 'rule_reference', value: 'HTJL_32_PRICE_ESTIMATE', source_id: 'HTJL_32_PRICE_ESTIMATE', note: 'intern' }
  ],
  evidence_summary: { documented: 1, rule: 1 },
  draft: { allowed: true, text: 'Hei, jeg ber om en forklaring.', reason: null }
};

const out = projectFullResult(internal, registry);
const text = JSON.stringify(out);
assert.equal(out.rules.length, 1);
assert.equal(out.rules[0].law, 'håndverkertjenesteloven');
assert.equal(out.analysis.findings[0].title, 'Fakturaen overstiger kontrollnivået');
assert.equal(out.evidence.length, 1);
assert.equal(text.includes('HTJL_'), false);
assert.equal(text.includes('ESTIMATE_ABOVE_'), false);
assert.equal(text.includes('code'), false);
assertNoPrivateFields(out);

console.log('OK public paid-result projection');
