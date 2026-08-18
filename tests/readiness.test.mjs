import assert from 'node:assert/strict';
import { evaluateReadiness, publicReadiness } from '../server/readiness.mjs';

const fixedNow = new Date('2026-08-18T18:00:00Z');
const activeRule = { status: 'active', source_url: 'https://lovdata.no/lov/test', last_verified: '2026-08-18' };
const adapters = {
  caseStore: { getOwned() {}, save() {} },
  storage: { reservePrivateObject() {}, listCaseDocuments() {} },
  extractor: { extract() {} }
};
const gateway = { createSession() {}, verifyEvent() {} };
const good = evaluateReadiness({
  product: { price_nok: 29, full_check_free: false, market: 'NO', audience: 'consumer' },
  registry: { rules: [activeRule] },
  adapters,
  paymentGateway: gateway,
  now: fixedNow
});
assert.equal(good.ready, true);
assert.equal(good.failed_count, 0);
assert.ok(good.checks.some(c => c.name === 'rules.freshness' && c.ok));

const stale = evaluateReadiness({
  product: { price_nok: 29, full_check_free: false, market: 'NO', audience: 'consumer' },
  registry: { rules: [{ ...activeRule, last_verified: '2026-06-01' }] },
  adapters,
  paymentGateway: gateway,
  now: fixedNow
});
assert.equal(stale.ready, false);
assert.ok(stale.checks.some(c => c.name === 'rules.freshness' && !c.ok));

const bad = evaluateReadiness({
  product: { price_nok: 0, full_check_free: true, market: 'NO', audience: 'consumer' },
  registry: { rules: [{ ...activeRule, source_url: 'https://example.com/fake' }] },
  adapters: { caseStore: adapters.caseStore },
  paymentGateway: null,
  now: fixedNow
});
assert.equal(bad.ready, false);
assert.ok(bad.failed_count >= 4);
const publicBad = publicReadiness(bad);
assert.equal(JSON.stringify(publicBad).includes('example.com'), false);
assert.equal(JSON.stringify(publicBad).includes('Lovdata-kilde'), false);
assert.ok(publicBad.checks.every(c => Object.keys(c).sort().join(',') === 'name,ok'));

console.log('OK readiness');
