import fs from 'node:fs';
import assert from 'node:assert/strict';
import { analyzeCase } from '../engine/analyzer.mjs';
import { analyzeInkasso } from '../engine/inkasso.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));
const publicRegistry = JSON.parse(fs.readFileSync(new URL('../site/rules/rules.json', import.meta.url), 'utf8'));

assert.deepEqual(publicRegistry, registry, 'public demo rule mirror must be byte-equivalent in meaning to canonical registry');
assert.equal(registry.engine_version, '0.30.0');

const statusById = new Map(registry.rules.map(rule => [rule.id, rule.status]));
const activeIds = new Set(registry.rules.filter(rule => rule.status === 'active').map(rule => rule.id));
const candidateIds = new Set(registry.rules.filter(rule => rule.status === 'candidate').map(rule => rule.id));

assert.equal(statusById.get('HTJL_8_FAILURE_TO_ADVISE'), 'candidate');
assert.equal(statusById.get('POF_10_SERVICE_PRICES'), 'candidate');
assert.equal(activeIds.has('POF_10_SERVICE_PRICES'), false, '§ 10 must not be customer-active without a deterministic evidence predicate');

const caseFixtures = [
  {
    name: 'verksted prisøkning uten dokumentert varsling',
    expected: ['HTJL_7_DUTY_TO_ADVISE'],
    input: {
      party_type: 'consumer',
      case_type: 'handcraft_service',
      industry: 'vehicle_repair',
      invoice_total: 28000,
      agreed_price: 12000,
      price_increase_after_start: true,
      customer_notified: false
    }
  },
  {
    name: 'tilleggsarbeid uten dokumentert avklaring og prisgrunnlag',
    expected: ['HTJL_9_ADDITIONAL_WORK', 'HTJL_33_SURCHARGE'],
    input: {
      party_type: 'consumer',
      case_type: 'handcraft_service',
      industry: 'vehicle_repair',
      invoice_total: 18000,
      agreed_price: 12000,
      additional_work_detected: true,
      additional_work_authorization_documented: false,
      additional_work_price_documented: false
    }
  },
  {
    name: 'prisoverslag over 15 prosent',
    expected: ['HTJL_32_PRICE_ESTIMATE', 'HTJL_33_SURCHARGE'],
    input: {
      party_type: 'consumer',
      case_type: 'handcraft_service',
      price_basis: 'estimate',
      agreed_price: 10000,
      invoice_total: 12000,
      surcharge_documented: false
    }
  },
  {
    name: 'diagnosekostnad ikke opplyst på forhånd',
    expected: ['HTJL_34_PRELIMINARY_EXAMINATION'],
    input: {
      party_type: 'consumer',
      case_type: 'handcraft_service',
      industry: 'vehicle_repair',
      invoice_total: 2500,
      preliminary_examination_fee: 2500,
      preliminary_fee_disclosed_beforehand: false
    }
  },
  {
    name: 'fakturagebyr på håndverkertjeneste',
    expected: ['HTJL_36_INVOICE'],
    input: {
      party_type: 'consumer',
      case_type: 'handcraft_service',
      invoice_total: 10500,
      agreed_price: 10000,
      invoice_fee: 500
    }
  },
  {
    name: 'fakturagebyr på varekjøp uten avtale',
    expected: ['FKJL_37_PRICE_AND_FEE'],
    input: {
      party_type: 'consumer',
      case_type: 'goods',
      invoice_total: 10099,
      agreed_price: 10000,
      invoice_fee: 99,
      invoice_fee_agreed: false
    }
  },
  {
    name: 'dokumentert motstrid om separat tilleggsbetaling',
    expected: ['MFL_11_UNAGREED_PAYMENT'],
    input: {
      party_type: 'consumer',
      case_type: 'goods',
      invoice_total: 11499,
      agreed_price: 10000,
      additional_payment_amount: 1499,
      additional_payment_agreement_status: 'contradicted'
    }
  },
  {
    name: 'skriftlig pristilbud med prisøkning etter oppstart',
    expected: ['POF_12_QUOTE'],
    input: {
      party_type: 'consumer',
      case_type: 'service_quote',
      invoice_total: 27000,
      agreed_price: 18000,
      price_increase_after_start: true,
      customer_notified: false
    }
  },
  {
    name: 'tjenesteregning ikke tilstrekkelig spesifisert',
    expected: ['POF_13_ITEMIZED_INVOICE'],
    input: {
      party_type: 'consumer',
      case_type: 'service',
      invoice_total: 9000,
      invoice_specification_sufficient: false
    }
  },
  {
    name: 'formelle salgsdokumentfelt mangler',
    expected: ['BOF_5_1_1_SALES_DOC'],
    input: {
      party_type: 'consumer',
      case_type: 'goods',
      invoice_total: 5000,
      missing_formal_fields: ['betalingsforfall']
    }
  },
  {
    name: 'selgers MVA-angivelse avviker fra registerstatus',
    expected: ['BOF_5_1_2_PARTIES'],
    input: {
      party_type: 'consumer',
      case_type: 'goods',
      invoice_total: 5000,
      seller_mva_marker_mismatch: true
    }
  }
];

const collectionFixtures = [
  {
    name: 'kort inkassovarsel',
    expected: ['INK_9_NOTICE'],
    input: { stage: 'collection_notice', payment_deadline_days: 7 }
  },
  {
    name: 'bestridt krav med ordinær inkasso, kostnader og uavklart tvil',
    expected: ['INK_8_GOOD_PRACTICE', 'INK_10_PAYMENT_REQUEST', 'INK_17_COLLECTION_COSTS'],
    input: {
      stage: 'payment_request',
      payment_deadline_days: 14,
      claim_disputed: true,
      dispute_documentation_provided: true,
      dispute_reasonable: true,
      ordinary_collection_continues: true,
      collection_costs: 1200,
      claim_doubt_known: true,
      doubt_assessed_before_request: false
    }
  }
];

const covered = new Set();

for (const fixture of caseFixtures) {
  const result = analyzeCase(fixture.input, registry);
  for (const id of result.rule_ids ?? []) {
    assert.equal(statusById.get(id), 'active', `${fixture.name}: customer analysis returned non-active rule ${id}`);
    covered.add(id);
  }
  for (const id of fixture.expected) {
    assert.ok(result.rule_ids.includes(id), `${fixture.name}: expected ${id}, got ${(result.rule_ids ?? []).join(', ')}`);
  }
}

for (const fixture of collectionFixtures) {
  const result = analyzeInkasso(fixture.input);
  for (const id of result.rule_ids ?? []) {
    assert.equal(statusById.get(id), 'active', `${fixture.name}: collection engine returned non-active rule ${id}`);
    covered.add(id);
  }
  for (const id of fixture.expected) {
    assert.ok(result.rule_ids.includes(id), `${fixture.name}: expected ${id}, got ${(result.rule_ids ?? []).join(', ')}`);
  }
}

const uncovered = [...activeIds].filter(id => !covered.has(id)).sort();
assert.deepEqual(uncovered, [], `Every active rule must have a deterministic positive fixture. Uncovered: ${uncovered.join(', ')}`);

for (const candidate of candidateIds) {
  assert.equal(covered.has(candidate), false, `Candidate rule ${candidate} must never be covered by customer output fixtures`);
}

// Aggressive input deliberately supplies facts around both candidate areas. There is still no customer-safe
// automatic route for § 8's counterfactual consequence or § 10's pre-contract price-information duty.
const candidatePressure = analyzeCase({
  party_type: 'consumer',
  case_type: 'handcraft_service',
  invoice_total: 40000,
  agreed_price: 10000,
  price_increase_after_start: true,
  customer_notified: false,
  additional_work_detected: true,
  additional_work_authorization_documented: false,
  price_information_missing: true,
  full_price_not_disclosed: true,
  consumer_would_have_cancelled: true
}, registry);
for (const candidate of candidateIds) {
  assert.equal(candidatePressure.rule_ids.includes(candidate), false, `Candidate ${candidate} leaked into customer analysis`);
}

assert.equal(activeIds.size, 16, 'Current reviewed automatic V1 surface should contain exactly 16 active rule tracks');
assert.equal(candidateIds.size, 2, 'Current candidate surface should contain § 8 and price-information § 10');

console.log(`OK active-rule coverage: all ${activeIds.size} active rules have deterministic positive fixtures; ${candidateIds.size} candidate rules remain customer-inactive.`);
