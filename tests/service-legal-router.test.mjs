import fs from 'node:fs';
import assert from 'node:assert/strict';
import { resolveServiceLegalProfile } from '../engine/service-legal-router.mjs';
import { runCase } from '../engine/case-service.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../rules/rules.json', import.meta.url), 'utf8'));

const workshop = resolveServiceLegalProfile({ route: 'handcraft_service', facts: { industry: 'vehicle_repair' } });
assert.equal(workshop.status, 'ready');
assert.equal(workshop.id, 'vehicle_paid_repair');
assert.equal(workshop.package_id, 'vehicle_repair');
assert.equal(workshop.primary_framework, 'håndverkertjenesteloven');
assert.ok(workshop.secondary_frameworks.includes('verkstedforskriften'));
assert.ok(workshop.specialist_registers.includes('vegvesen_workshop'));

const warranty = resolveServiceLegalProfile({
  route: 'handcraft_service',
  facts: { industry: 'vehicle_repair', vehicle_service_context: 'reklamasjon' }
});
assert.equal(warranty.status, 'needs_clarification');
assert.equal(warranty.package_id, null);
assert.ok(warranty.relevant_frameworks.includes('forbrukerkjøpsloven'));

const pkk = resolveServiceLegalProfile({
  route: 'handcraft_service',
  facts: { industry: 'vehicle_repair', vehicle_service_context: 'eu_control' }
});
assert.equal(pkk.status, 'ready');
assert.equal(pkk.package_id, 'vehicle_inspection');
assert.equal(pkk.primary_framework, 'forskrift om periodisk kontroll av kjøretøy');

const collision = resolveServiceLegalProfile({
  route: 'handcraft_service',
  facts: { industry: 'vehicle_repair', vehicle_service_context: 'collision_repair' }
});
assert.equal(collision.id, 'vehicle_collision_repair');
assert.ok(collision.secondary_frameworks.includes('verkstedforskriften § 14a'));

const electrical = resolveServiceLegalProfile({ route: 'handcraft_service', facts: { industry: 'electrical' } });
assert.equal(electrical.package_id, 'electrical_work');
assert.ok(electrical.secondary_frameworks.some(value => value.includes('elektroforetak')));
assert.ok(electrical.specialist_registers.includes('dsb_elvirksomhet'));

const plumbing = resolveServiceLegalProfile({ route: 'handcraft_service', facts: { industry: 'vvs' } });
assert.equal(plumbing.package_id, 'plumbing_vvs');
assert.ok(plumbing.notes.some(value => /frivillig/i.test(value)), 'sentral godkjenning must not be represented as mandatory');

const heatPump = resolveServiceLegalProfile({ route: 'handcraft_service', facts: { industry: 'varmepumpe' } });
assert.equal(heatPump.package_id, 'heat_pump_installation');
assert.ok(heatPump.secondary_frameworks.some(value => /f-gass/i.test(value)));

const moving = resolveServiceLegalProfile({ route: 'service_quote', facts: { industry: 'moving' } });
assert.equal(moving.package_id, 'moving_service');
assert.equal(moving.primary_framework, 'avtalen mellom partene');
assert.ok(moving.notes.some(value => /Håndverkertjenesteloven gjelder ikke/i.test(value)));
assert.ok(moving.notes.some(value => /Vegfraktloven.*ikke/i.test(value)));

const cleaning = resolveServiceLegalProfile({ route: 'service_quote', facts: { industry: 'renhold' } });
assert.equal(cleaning.package_id, 'cleaning_service');
assert.ok(cleaning.specialist_registers.includes('arbeidstilsynet_cleaning'));
assert.ok(cleaning.secondary_frameworks.some(value => /godkjenning av renholdsvirksomheter/i.test(value)));

const credit = resolveServiceLegalProfile({ route: 'goods', facts: { financing_detected: true } });
assert.equal(credit.status, 'needs_clarification');
assert.ok(credit.relevant_frameworks.includes('finansavtaleloven'));

const purchaseInstallation = resolveServiceLegalProfile({
  route: 'handcraft_service',
  facts: { industry: 'installation', transaction_nature: 'purchase_dominant' }
});
assert.equal(purchaseInstallation.status, 'needs_clarification');
assert.ok(purchaseInstallation.relevant_frameworks.includes('forbrukerkjøpsloven'));

const ordinaryInstallation = resolveServiceLegalProfile({
  route: 'handcraft_service',
  facts: { industry: 'installation', transaction_nature: 'service_dominant' }
});
assert.equal(ordinaryInstallation.package_id, 'installation_service');
assert.equal(ordinaryInstallation.primary_framework, 'håndverkertjenesteloven');

const warrantyCase = runCase({
  intake: { buyer_type: 'consumer', subject: 'handcraft_service', documents: ['invoice'] },
  facts: { industry: 'vehicle_repair', vehicle_service_context: 'warranty', invoice_total: 2500 },
  registry
});
assert.equal(warrantyCase.status, 'needs_clarification');
assert.equal(warrantyCase.analysis, null, 'warranty/complaint repair must stop before HTJL analysis');
assert.equal(warrantyCase.rule_package, null);
assert.ok(warrantyCase.intake.questions.some(value => /reklamasjon|garanti/i.test(value)));

const pkkCase = runCase({
  intake: { buyer_type: 'consumer', subject: 'handcraft_service', documents: ['invoice'] },
  facts: {
    industry: 'vehicle_repair',
    vehicle_service_context: 'pkk',
    agreed_price: 1200,
    invoice_total: 1500,
    price_increase_after_start: true,
    customer_notified: false,
    invoice_specification_sufficient: false
  },
  registry
});
assert.equal(pkkCase.rule_package.id, 'vehicle_inspection');
assert.equal(pkkCase.analysis.rule_package, 'vehicle_inspection');
assert.equal(pkkCase.analysis.rule_ids.some(id => id.startsWith('HTJL_')), false, 'PKK must not inherit ordinary repair HTJL rules');
assert.ok(pkkCase.analysis.rule_ids.every(id => pkkCase.rule_package.id === 'vehicle_inspection'));

const movingCase = runCase({
  intake: { buyer_type: 'consumer', subject: 'service_quote', documents: ['invoice', 'quote'] },
  facts: {
    industry: 'moving',
    agreed_price: 10000,
    invoice_total: 14000,
    price_increase_after_start: true,
    customer_notified: false,
    invoice_specification_sufficient: false
  },
  registry
});
assert.equal(movingCase.rule_package.id, 'moving_service');
assert.equal(movingCase.analysis.rule_ids.some(id => id.startsWith('HTJL_')), false, 'moving must never receive handcraft rules');
assert.ok(movingCase.analysis.rule_ids.includes('POF_12_QUOTE'));

console.log('OK service legal router separates vehicle repair/remedy/PKK, electrical, VVS, heat pump, moving, cleaning, installation and credit boundaries.');
