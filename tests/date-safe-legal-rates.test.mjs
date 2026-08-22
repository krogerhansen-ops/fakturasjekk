import fs from 'node:fs';
import assert from 'node:assert/strict';
import { assertLegalRateRegistry, resolveLegalRate, resolveLateInterestRate, resolveCollectionRate } from '../engine/legal-rates.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/dynamic-rates.json', import.meta.url), 'utf8'));
const sourceWatch = fs.readFileSync(new URL('../scripts/legal-source-check.mjs', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../.github/workflows/legal-source-watch.yml', import.meta.url), 'utf8');

assert.equal(registry.runtime, false, 'controlled rates must remain non-runtime until explicitly integrated');
assert.equal(registry.purpose, 'controlled_rate_registry_before_runtime_integration');
assert.equal(registry.last_reviewed, '2026-08-22');
assert.equal(assertLegalRateRegistry(registry), true);
assert.equal(registry.rates.length, 7);
assert.ok(registry.rates.every(rate => /^https:\/\/(?:www\.)?(?:finanstilsynet\.no|lovdata\.no)\//.test(rate.source_url)), '2026 collection/rate data must use Lovdata or Finanstilsynet sources');

const h1End = resolveLateInterestRate(registry, { date: '2026-06-30' });
assert.equal(h1End.status, 'resolved');
assert.equal(h1End.rate.id, 'LATE_INTEREST_2026_H1');
assert.equal(h1End.rate.value, 12);

const h2Start = resolveLateInterestRate(registry, { date: '2026-07-01' });
assert.equal(h2Start.status, 'resolved');
assert.equal(h2Start.rate.id, 'LATE_INTEREST_2026_H2');
assert.equal(h2Start.rate.value, 12.25);

const current = resolveLateInterestRate(registry, { date: '2026-08-22' });
assert.equal(current.rate.value, 12.25);
assert.equal(current.rate.source_authority, 'Finanstilsynet');

assert.equal(resolveLateInterestRate(registry, { date: '2026-02-30' }).status, 'needs_clarification');
assert.equal(resolveLateInterestRate(registry, { date: '' }).status, 'needs_clarification');
assert.equal(resolveLateInterestRate(registry, { date: '2027-01-01' }).status, 'not_resolved', 'latest 2026 rate must never be reused retroactively/forward by default');

const consumerComp = resolveCollectionRate(registry, { type: 'standard_collection_compensation_nok', date: '2026-08-22', consumer: true });
assert.equal(consumerComp.status, 'not_applicable_to_consumer');
assert.equal(consumerComp.rate, null);
const nonConsumerComp = resolveCollectionRate(registry, { type: 'standard_collection_compensation_nok', date: '2026-08-22', consumer: false });
assert.equal(nonConsumerComp.status, 'resolved');
assert.equal(nonConsumerComp.rate.value, 430);

const reminder = resolveCollectionRate(registry, { type: 'reminder_or_collection_notice_fee_nok', date: '2026-04-01' });
assert.equal(reminder.status, 'resolved');
assert.equal(reminder.rate.value, 38);
const ownRequest = resolveCollectionRate(registry, { type: 'creditor_payment_request_fee_nok', date: '2026-10-01' });
assert.equal(ownRequest.status, 'resolved');
assert.equal(ownRequest.rate.value, 113);
const inkassoRate = resolveCollectionRate(registry, { type: 'inkasso_rate_nok', date: '2026-12-31' });
assert.equal(inkassoRate.status, 'resolved');
assert.equal(inkassoRate.rate.value, 750);

assert.equal(resolveLegalRate(registry, { date: '2026-08-22' }).status, 'needs_clarification');
assert.equal(resolveLegalRate(registry, { type: 'unknown', date: '2026-08-22' }).status, 'not_resolved');

const overlap = structuredClone(registry);
overlap.rates.push({ ...overlap.rates[0], id: 'OVERLAP_TEST', effective_from: '2026-06-01', effective_to: '2026-06-30' });
assert.throws(() => assertLegalRateRegistry(overlap), /Overlapping legal rates/);
const runtimeAccident = structuredClone(registry);
runtimeAccident.runtime = true;
assert.throws(() => assertLegalRateRegistry(runtimeAccident), /must remain non-runtime/);

assert.match(sourceWatch, /dynamic-rates\.json/);
assert.match(sourceWatch, /assertLegalRateRegistry/);
assert.match(sourceWatch, /controlled_rate/);
assert.match(workflow, /'rules\/\*\*'/, 'rate changes under rules must trigger legal source watch');

console.log('OK date-safe 2026 legal rates are source-controlled, consumer-safe and monitored without runtime activation.');
