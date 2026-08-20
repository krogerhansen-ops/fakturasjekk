import fs from 'node:fs';
import assert from 'node:assert/strict';
import { resolveServiceLegalProfile } from '../engine/service-legal-router.mjs';
import { classifyIntake } from '../engine/intake.mjs';

const html = fs.readFileSync('site/index-launch-candidate.html', 'utf8');

const publicProfiles = [
  { label: 'Håndverker og oppussing', route: 'handcraft_service', facts: { industry: 'painting' }, expected: 'home_handcraft' },
  { label: 'Elektriker', route: 'handcraft_service', facts: { industry: 'electrical' }, expected: 'electrical_work' },
  { label: 'Rørlegger og VVS', route: 'handcraft_service', facts: { industry: 'plumbing' }, expected: 'plumbing_vvs' },
  { label: 'Bilverksted og bilservice', route: 'handcraft_service', facts: { industry: 'vehicle_repair' }, expected: 'vehicle_repair' },
  { label: 'Flytting og transport', route: 'service_quote', facts: { industry: 'moving' }, expected: 'moving_service' },
  { label: 'Renhold og servicetjenester', route: 'service_quote', facts: { industry: 'cleaning' }, expected: 'cleaning_service' },
  { label: 'Montering og installasjon', route: 'handcraft_service', facts: { industry: 'installation', transaction_nature: 'service_dominant' }, expected: 'installation_service' }
];

for (const item of publicProfiles) {
  assert.ok(html.includes(item.label), `public category disappeared: ${item.label}`);
  const profile = resolveServiceLegalProfile({ route: item.route, facts: item.facts });
  assert.equal(profile.status, 'ready', `${item.label}: public support must have a ready legal profile`);
  assert.equal(profile.package_id, item.expected, `${item.label}: wrong legal package`);
}

assert.ok(html.includes('Andre forbrukerfakturaer'));
const goods = resolveServiceLegalProfile({ route: 'goods', facts: {} });
const otherService = resolveServiceLegalProfile({ route: 'service_quote', facts: { industry: 'other' } });
assert.equal(goods.status, 'ready');
assert.equal(goods.package_id, 'goods');
assert.equal(otherService.status, 'ready');
assert.equal(otherService.package_id, 'other_service');

// Varmepumpe er nevnt under montering/installasjon og har et eget faglig særspor.
assert.match(html, /varmepumpe/i);
const heatPump = resolveServiceLegalProfile({ route: 'handcraft_service', facts: { industry: 'heat_pump' } });
assert.equal(heatPump.status, 'ready');
assert.equal(heatPump.package_id, 'heat_pump_installation');

// Kritiske grenseflater må fortsatt stoppe før feil lovfamilie brukes.
const warranty = resolveServiceLegalProfile({ route: 'handcraft_service', facts: { industry: 'vehicle_repair', vehicle_service_context: 'warranty' } });
assert.equal(warranty.status, 'needs_clarification');
const financed = resolveServiceLegalProfile({ route: 'goods', facts: { financing_detected: true } });
assert.equal(financed.status, 'needs_clarification');
const purchaseWithInstallation = resolveServiceLegalProfile({ route: 'handcraft_service', facts: { industry: 'installation', transaction_nature: 'purchase_dominant' } });
assert.equal(purchaseWithInstallation.status, 'needs_clarification');

const newBuilding = classifyIntake({ buyer_type: 'consumer', subject: 'new_building', documents: ['invoice'] });
assert.equal(newBuilding.supported, false);
assert.equal(newBuilding.status, 'stop');

console.log('OK every public invoice category is bound to an explicit legal profile, while warranty/finance/purchase-installation/new-build boundaries stay fail-closed.');
