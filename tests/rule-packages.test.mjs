import fs from 'node:fs';
import assert from 'node:assert/strict';
import { runCase } from '../engine/case-service.mjs';
import {
  resolveRulePackage,
  assertRulePackageCompatibility,
  packageRuleIds,
  collectionRuleIds
} from '../engine/rule-packages.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));

const goods = resolveRulePackage({ route: 'goods', facts: {} });
assert.equal(goods.id, 'goods');
assert.equal(goods.allowed_rule_ids.includes('HTJL_34_PRELIMINARY_EXAMINATION'), false);
assert.ok(goods.allowed_rule_ids.includes('FKJL_37_PRICE_AND_FEE'));

const workshop = resolveRulePackage({ route: 'handcraft_service', facts: { industry: 'vehicle_repair' } });
assert.equal(workshop.id, 'vehicle_repair');
assert.ok(workshop.allowed_rule_ids.includes('HTJL_34_PRELIMINARY_EXAMINATION'));
assert.ok(workshop.allowed_rule_ids.includes('HTJL_9_ADDITIONAL_WORK'));

const handcraft = resolveRulePackage({ route: 'handcraft_service', facts: { industry: 'electrical' } });
assert.equal(handcraft.id, 'home_handcraft');

const service = resolveRulePackage({ route: 'service_quote', facts: { industry: 'moving' } });
assert.equal(service.id, 'other_service');
assert.equal(service.allowed_rule_ids.some(id => id.startsWith('HTJL_')), false);

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

const withCollection = runCase({
  intake: { buyer_type: 'consumer', subject: 'goods', documents: ['invoice'] },
  facts: { agreed_price: 1000, invoice_total: 1000 },
  collection: {
    applicable: true,
    collection_notice_sent: true,
    collection_notice_after_due_date: true,
    collection_notice_days: 10
  },
  registry
});
assert.equal(withCollection.rule_package.collection_overlay, true);
assert.ok(withCollection.analysis.rule_ids.every(id => packageRuleIds(goods, { collection: true }).includes(id)));

console.log('OK internal rule packages route goods, vehicle repair, handcraft, services and collection without brand-specific logic.');
