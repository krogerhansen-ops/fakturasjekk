import fs from 'node:fs';
import assert from 'node:assert/strict';
import { analyzeCase } from '../engine/analyzer.mjs';
import { buildDraft } from '../engine/draft.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));

const analysis = analyzeCase({
  party_type: 'consumer',
  case_type: 'handcraft_service',
  price_basis: 'estimate',
  agreed_price: 120000,
  invoice_total: 146000,
  invoice_fee: 500,
  surcharge_documented: false
}, registry);

const request = buildDraft({
  analysis,
  registry,
  invoice_reference: '12345',
  user_note: 'Jeg fikk ingen beskjed om ekstraarbeid før fakturaen kom.',
  mode: 'request'
});
assert.equal(request.allowed, true);
assert.ok(request.text.includes('faktura 12345'));
assert.ok(request.text.includes('håndverkertjenesteloven § 32 og § 33'));
assert.ok(request.text.includes('håndverkertjenesteloven § 36'));
assert.ok(request.text.includes('Tilleggsopplysning fra meg:'));
assert.ok(request.text.includes('Jeg fikk ingen beskjed om ekstraarbeid før fakturaen kom.'));
assert.equal(/HTJL_|FKJL_|POF_|BOF_/.test(request.text), false, 'internal rule ids must never leak');

const objection = buildDraft({ analysis, registry, mode: 'objection' });
assert.equal(objection.allowed, true);
assert.ok(objection.text.includes('Jeg bestrider de delene av kravet'));

const cleanAnalysis = analyzeCase({
  party_type: 'consumer',
  case_type: 'goods',
  agreed_price: 3490,
  invoice_total: 3490
}, registry);
const cleanDraft = buildDraft({ analysis: cleanAnalysis, registry });
assert.equal(cleanDraft.allowed, false);
assert.ok(cleanDraft.reason.includes('Ingen dokumenterte avvik'));

const unsupported = analyzeCase({
  party_type: 'business',
  case_type: 'goods',
  agreed_price: 1000,
  invoice_total: 1500
}, registry);
const unsupportedDraft = buildDraft({ analysis: unsupported, registry });
assert.equal(unsupportedDraft.allowed, false);

const modifiedRegistry = structuredClone(registry);
modifiedRegistry.rules.find(r => r.id === 'HTJL_36_INVOICE').status = 'review_required';
const draftWithStaleRule = buildDraft({ analysis, registry: modifiedRegistry });
assert.equal(draftWithStaleRule.allowed, true);
assert.equal(draftWithStaleRule.text.includes('håndverkertjenesteloven § 36'), false, 'non-active rules must not be cited');

console.log('OK: controlled draft generator blocks clean/unsupported cases, hides internal ids and cites active rules only.');
