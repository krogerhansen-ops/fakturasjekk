import fs from 'node:fs';
import assert from 'node:assert/strict';
import { runCase } from '../engine/case-service.mjs';
import {
  resolveRulePackage,
  assertRulePackageCompatibility,
  packageRuleIds,
  collectionRuleIds
} from '../engine/rule-packages.mjs';
import { resolveServiceLegalProfile } from '../engine/service-legal-router.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));

const goods = resolveRulePackage({ route: 'goods', facts: {} });
assert.equal(goods.id, 'goods');
assert.equal(goods.allowed_rule_ids.includes('HTJL_34_PRELIMINARY_EXAMINATION'), false);
assert.ok(goods.allowed_rule_ids.includes('FKJL_37_PRICE_AND_FEE'));
assert.equal(goods.allowed_rule_ids.includes('POF_10_SERVICE_PRICES'), false, 'candidate rule must not enter an automatic package');

const workshop = resolveRulePackage({ route: 'handcraft_service', facts: { industry: 'vehicle_repair' } });
assert.equal(workshop.id, 'vehicle_repair');
assert.ok(workshop.allowed_rule_ids.includes('HTJL_34_PRELIMINARY_EXAMINATION'));
assert.ok(workshop.allowed_rule_ids.includes('HTJL_9_ADDITIONAL_WORK'));

const electrical = resolveRulePackage({ route: 'handcraft_service', facts: { industry: 'electrical' } });
assert.equal(electrical.id, 'electrical_work');
assert.ok(electrical.allowed_rule_ids.includes('HTJL_32_PRICE_ESTIMATE'));

const plumbing = resolveRulePackage({ route: 'handcraft_service', facts: { industry: 'vvs' } });
assert.equal(plumbing.id, 'plumbing_vvs');

const heatPump = resolveRulePackage({ route: 'handcraft_service', facts: { industry: 'varmepumpe' } });
assert.equal(heatPump.id, 'heat_pump_installation');

const handcraft = resolveRulePackage({ route: 'handcraft_service', facts: { industry: 'painting' } });
assert.equal(handcraft.id, 'home_handcraft');

const moving = resolveRulePackage({ route: 'service_quote', facts: { industry: 'moving' } });
assert.equal(moving.id, 'moving_service');
assert.equal(moving.allowed_rule_ids.some(id => id.startsWith('HTJL_')), false);

const cleaning = resolveRulePackage({ route: 'service_quote', facts: { industry: 'cleaning' } });
assert.equal(cleaning.id, 'cleaning_service');
assert.equal(cleaning.allowed_rule_ids.some(id => id.startsWith('HTJL_')), false);

const genericService = resolveRulePackage({ route: 'service_quote', facts: { industry: 'other' } });
assert.equal(genericService.id, 'other_service');
assert.equal(genericService.allowed_rule_ids.some(id => id.startsWith('HTJL_')), false);

const pkkProfile = resolveServiceLegalProfile({
  route: 'handcraft_service',
  facts: { industry: 'vehicle_repair', vehicle_service_context: 'pkk' }
});
const pkkPackage = resolveRulePackage({ route: 'handcraft_service', facts: { industry: 'vehicle_repair', vehicle_service_context: 'pkk' }, legalProfile: pkkProfile });
assert.equal(pkkPackage.id, 'vehicle_inspection');
assert.equal(pkkPackage.allowed_rule_ids.some(id => id.startsWith('HTJL_')), false);

const warrantyProfile = resolveServiceLegalProfile({
  route: 'handcraft_service',
  facts: { industry: 'vehicle_repair', vehicle_service_context: 'warranty' }
});
assert.equal(resolveRulePackage({ route: 'handcraft_service', facts: { industry: 'vehicle_repair' }, legalProfile: warrantyProfile }), null, 'unresolved complaint/warranty route must not get an automatic package');

assert.deepEqual(new Set(collectionRuleIds()), new Set([
  'INK_8_GOOD_PRACTICE',
  'INK_9_NOTICE',
  'INK_10_PAYMENT_REQUEST',
  'INK_17_COLLECTION_COSTS'
]));
assert.ok(packageRuleIds(goods, { collection: true }).includes('INK_9_NOTICE'));

assert.throws(() => assertRulePackageCompatibility({
  analysis: { rule_ids: ['HTJL_34_PRELIMINARY_EXAMINATION'] },
  rulePackage: goods,
  collection: false
}), error => error?.code === 'rule_package_violation' && error?.rule_package === 'goods');

const retailResult = runCase({
  intake: { buyer_type: 'consumer', subject: 'goods', documents: ['invoice', 'order_confirmation'] },
  facts: {
    agreed_price: 12990,
    invoice_total: 15388,
    additional_payment_amount: 2398,
    additional_payment_agreement_status: 'not_found',
    seller_mva_marker_mismatch: true,
    lines: [
      { description: 'TV', quantity: 1, unit_price: 12990 },
      { description: 'Premium levering', quantity: 1, unit_price: 899 },
      { description: 'Trygghetspakke', quantity: 1, unit_price: 1499 }
    ]
  },
  registry
});
assert.equal(retailResult.rule_package.id, 'goods');
assert.equal(retailResult.analysis.rule_package, 'goods');
assert.ok(retailResult.analysis.rule_ids.includes('MFL_11_UNAGREED_PAYMENT'));
assert.ok(retailResult.analysis.rule_ids.every(id => packageRuleIds(goods).includes(id)));

const workshopResult = runCase({
  intake: { buyer_type: 'consumer', subject: 'handcraft_service', documents: ['invoice'] },
  facts: {
    industry: 'vehicle_repair',
    agreed_price: 6000,
    invoice_total: 8500,
    preliminary_examination_fee: 1800,
    preliminary_fee_disclosed_beforehand: false,
    additional_work_detected: true,
    additional_work_authorization_documented: false,
    lines: [
      { description: 'Service', quantity: 1, unit_price: 6000 },
      { description: 'Diagnose', quantity: 1, unit_price: 1800 },
      { description: 'Tilleggsarbeid', quantity: 1, unit_price: 700 }
    ]
  },
  registry
});
assert.equal(workshopResult.rule_package.id, 'vehicle_repair');
assert.ok(workshopResult.analysis.rule_ids.includes('HTJL_34_PRELIMINARY_EXAMINATION'));
assert.ok(workshopResult.analysis.rule_ids.includes('HTJL_9_ADDITIONAL_WORK'));
assert.ok(workshopResult.analysis.rule_ids.every(id => packageRuleIds(workshop).includes(id)));

const movingResult = runCase({
  intake: { buyer_type: 'consumer', subject: 'service_quote', documents: ['invoice', 'quote'] },
  facts: {
    industry: 'moving',
    agreed_price: 10000,
    invoice_total: 13500,
    price_increase_after_start: true,
    customer_notified: false,
    invoice_specification_sufficient: false
  },
  registry
});
assert.equal(movingResult.rule_package.id, 'moving_service');
assert.ok(movingResult.analysis.rule_ids.includes('POF_12_QUOTE'));
assert.equal(movingResult.analysis.rule_ids.some(id => id.startsWith('HTJL_')), false);

const cleaningResult = runCase({
  intake: { buyer_type: 'consumer', subject: 'service_quote', documents: ['invoice', 'quote'] },
  facts: {
    industry: 'cleaning',
    agreed_price: 4500,
    invoice_total: 5400,
    additional_payment_amount: 900,
    additional_payment_agreement_status: 'not_found'
  },
  registry
});
assert.equal(cleaningResult.rule_package.id, 'cleaning_service');
assert.ok(cleaningResult.analysis.rule_ids.includes('MFL_11_UNAGREED_PAYMENT'));
assert.equal(cleaningResult.analysis.rule_ids.some(id => id.startsWith('HTJL_')), false);

const withCollection = runCase({
  intake: { buyer_type: 'consumer', subject: 'goods', documents: ['invoice'] },
  facts: { agreed_price: 1000, invoice_total: 1000 },
  collection: {
    stage: 'collection_notice',
    payment_deadline_days: 10
  },
  registry
});
assert.equal(withCollection.rule_package.collection_overlay, true);
assert.ok(withCollection.analysis.rule_ids.includes('INK_9_NOTICE'));
assert.ok(withCollection.analysis.rule_ids.every(id => packageRuleIds(goods, { collection: true }).includes(id)));

console.log('OK internal rule packages route goods, vehicle repair/PKK, electrical, VVS, heat pump, moving, cleaning, handcraft and collection without brand-specific logic.');
