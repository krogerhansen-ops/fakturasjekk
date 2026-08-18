import fs from 'node:fs';
import assert from 'node:assert/strict';
import { analyzeCase } from '../engine/analyzer.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));

const electrician = analyzeCase({
  party_type: 'consumer',
  case_type: 'handcraft_service',
  price_basis: 'estimate',
  agreed_price: 120000,
  invoice_total: 146000,
  invoice_fee: 500,
  surcharge_documented: false,
  lines: [
    { description: 'Arbeid og materiell', quantity: 1, unit_price: 136000 },
    { description: 'Servicebil', quantity: 1, unit_price: 2000 },
    { description: 'Servicebil', quantity: 1, unit_price: 2000 },
    { description: 'Fakturagebyr', quantity: 1, unit_price: 500 },
    { description: 'Feilsøking loft', quantity: 1, unit_price: 5500 }
  ]
}, registry);
assert.equal(electrician.status, 'attention');
assert.equal(electrician.calculations.difference, 26000);
assert.equal(electrician.calculations.estimate_control_ceiling_15pct, 138000);
assert.ok(electrician.findings.some(f => f.code === 'ESTIMATE_ABOVE_15_CONTROL'));
assert.ok(electrician.findings.some(f => f.code === 'HANDCRAFT_INVOICE_FEE'));
assert.ok(electrician.findings.some(f => f.code === 'EXACT_DUPLICATE_LINES'));
assert.ok(electrician.rule_ids.includes('HTJL_32_PRICE_ESTIMATE'));
assert.ok(electrician.questions.length > 0);

const goods = analyzeCase({
  party_type: 'consumer',
  case_type: 'goods',
  agreed_price: 25480,
  invoice_total: 28069,
  invoice_fee: 99,
  invoice_fee_agreed: false,
  lines: [
    { description: 'PC', quantity: 1, unit_price: 22990 },
    { description: 'Dockingstasjon', quantity: 1, unit_price: 2490 },
    { description: 'Dockingstasjon', quantity: 1, unit_price: 2490 },
    { description: 'Fakturagebyr', quantity: 1, unit_price: 99 }
  ]
}, registry);
assert.equal(goods.status, 'attention');
assert.equal(goods.calculations.difference, 2589);
assert.ok(goods.findings.some(f => f.code === 'GOODS_INVOICE_FEE'));
assert.ok(goods.findings.some(f => f.code === 'EXACT_DUPLICATE_LINES'));
assert.ok(goods.rule_ids.includes('FKJL_37_PRICE_AND_FEE'));

const moving = analyzeCase({
  party_type: 'consumer',
  case_type: 'service_quote',
  agreed_price: 18000,
  invoice_total: 27600,
  price_increase_after_start: true,
  customer_notified: false,
  missing_formal_fields: ['betalingsforfall']
}, registry);
assert.equal(moving.status, 'attention');
assert.ok(moving.findings.some(f => f.code === 'SERVICE_QUOTE_PRICE_INCREASE'));
assert.ok(moving.findings.some(f => f.code === 'FORMAL_INVOICE_FIELDS'));
assert.ok(moving.rule_ids.includes('POF_12_QUOTE'));
assert.ok(moving.rule_ids.includes('BOF_5_1_1_SALES_DOC'));

const clean = analyzeCase({
  party_type: 'consumer',
  case_type: 'goods',
  agreed_price: 3490,
  invoice_total: 3490,
  lines: [{ description: 'Vare', quantity: 1, unit_price: 3490 }]
}, registry);
assert.equal(clean.status, 'clean');
assert.equal(clean.findings[0].code, 'NO_DOCUMENTED_DEVIATION');

const b2b = analyzeCase({
  party_type: 'business',
  case_type: 'goods',
  agreed_price: 1000,
  invoice_total: 2000
}, registry);
assert.equal(b2b.supported, false);
assert.equal(b2b.status, 'unsupported');
assert.equal(b2b.findings[0].code, 'B2B_NOT_SUPPORTED');

console.log('OK: deterministic analysis core passed electrician, goods, service quote, clean and B2B-stop tests.');
