import { resolveServiceLegalProfile } from './service-legal-router.mjs';

const GOODS_RULES = Object.freeze([
  'FKJL_37_PRICE_AND_FEE',
  'MFL_11_UNAGREED_PAYMENT',
  'BOF_5_1_1_SALES_DOC',
  'BOF_5_1_2_PARTIES'
]);

const HANDCRAFT_RULES = Object.freeze([
  'HTJL_7_DUTY_TO_ADVISE',
  'HTJL_9_ADDITIONAL_WORK',
  'HTJL_32_PRICE_ESTIMATE',
  'HTJL_33_SURCHARGE',
  'HTJL_34_PRELIMINARY_EXAMINATION',
  'HTJL_36_INVOICE',
  'MFL_11_UNAGREED_PAYMENT',
  'POF_12_QUOTE',
  'POF_13_ITEMIZED_INVOICE',
  'BOF_5_1_1_SALES_DOC',
  'BOF_5_1_2_PARTIES'
]);

const GENERAL_SERVICE_RULES = Object.freeze([
  'MFL_11_UNAGREED_PAYMENT',
  'POF_12_QUOTE',
  'POF_13_ITEMIZED_INVOICE',
  'BOF_5_1_1_SALES_DOC',
  'BOF_5_1_2_PARTIES'
]);

const PACKAGE_DEFINITIONS = Object.freeze({
  goods: Object.freeze({
    id: 'goods',
    customer_label: 'Varekjøp',
    base_routes: ['goods'],
    allowed_rule_ids: GOODS_RULES
  }),
  vehicle_repair: Object.freeze({
    id: 'vehicle_repair',
    customer_label: 'Bilverksted og reparasjon',
    base_routes: ['handcraft_service'],
    industries: ['vehicle_repair', 'auto_repair', 'car_workshop', 'bilverksted'],
    allowed_rule_ids: HANDCRAFT_RULES
  }),
  vehicle_inspection: Object.freeze({
    id: 'vehicle_inspection',
    customer_label: 'EU-kontroll / periodisk kjøretøykontroll',
    base_routes: ['service_quote'],
    allowed_rule_ids: GENERAL_SERVICE_RULES
  }),
  electrical_work: Object.freeze({
    id: 'electrical_work',
    customer_label: 'Elektrikerarbeid',
    base_routes: ['handcraft_service'],
    industries: ['electrical', 'electrician', 'elektriker'],
    allowed_rule_ids: HANDCRAFT_RULES
  }),
  plumbing_vvs: Object.freeze({
    id: 'plumbing_vvs',
    customer_label: 'Rørlegger og VVS',
    base_routes: ['handcraft_service'],
    industries: ['plumbing', 'vvs', 'plumber', 'rorlegger', 'rørlegger'],
    allowed_rule_ids: HANDCRAFT_RULES
  }),
  heat_pump_installation: Object.freeze({
    id: 'heat_pump_installation',
    customer_label: 'Varmepumpe – montering og installasjon',
    base_routes: ['handcraft_service'],
    industries: ['heat_pump', 'heatpump', 'varmepumpe'],
    allowed_rule_ids: HANDCRAFT_RULES
  }),
  installation_service: Object.freeze({
    id: 'installation_service',
    customer_label: 'Montering og installasjon',
    base_routes: ['handcraft_service'],
    industries: ['installation', 'installation_service', 'montering'],
    allowed_rule_ids: HANDCRAFT_RULES
  }),
  home_handcraft: Object.freeze({
    id: 'home_handcraft',
    customer_label: 'Håndverk og arbeid på bolig/ting',
    base_routes: ['handcraft_service'],
    allowed_rule_ids: HANDCRAFT_RULES
  }),
  moving_service: Object.freeze({
    id: 'moving_service',
    customer_label: 'Flyttetjeneste',
    base_routes: ['service_quote'],
    industries: ['moving', 'moving_service', 'flytting', 'flyttebyra', 'flyttebyrå'],
    allowed_rule_ids: GENERAL_SERVICE_RULES
  }),
  cleaning_service: Object.freeze({
    id: 'cleaning_service',
    customer_label: 'Renholdstjeneste',
    base_routes: ['service_quote'],
    industries: ['cleaning', 'cleaning_service', 'renhold', 'flyttevask'],
    allowed_rule_ids: GENERAL_SERVICE_RULES
  }),
  other_service: Object.freeze({
    id: 'other_service',
    customer_label: 'Annen forbrukertjeneste',
    base_routes: ['service_quote'],
    allowed_rule_ids: GENERAL_SERVICE_RULES
  })
});

const COLLECTION_RULE_IDS = Object.freeze([
  'INK_8_GOOD_PRACTICE',
  'INK_9_NOTICE',
  'INK_10_PAYMENT_REQUEST',
  'INK_17_COLLECTION_COSTS'
]);

export function resolveRulePackage({ route, facts = {}, legalProfile = null } = {}) {
  const routing = legalProfile ?? resolveServiceLegalProfile({ route, facts });
  if (routing?.status !== 'ready' || !routing.package_id) return null;
  return PACKAGE_DEFINITIONS[routing.package_id] ?? null;
}

export function packageRuleIds(rulePackage, { collection = false } = {}) {
  if (!rulePackage) return [];
  return [...new Set([
    ...(rulePackage.allowed_rule_ids ?? []),
    ...(collection ? COLLECTION_RULE_IDS : [])
  ])];
}

export function assertRulePackageCompatibility({ analysis, rulePackage, collection = false } = {}) {
  if (!analysis || !rulePackage) {
    const error = new Error('Rule package could not be resolved for supported analysis.');
    error.code = 'rule_package_unresolved';
    throw error;
  }

  const allowed = new Set(packageRuleIds(rulePackage, { collection }));
  const emitted = [...new Set(analysis.rule_ids ?? [])];
  const incompatible = emitted.filter(id => !allowed.has(id));
  if (incompatible.length) {
    const error = new Error('Analysis emitted a legal rule outside the selected rule package.');
    error.code = 'rule_package_violation';
    error.rule_package = rulePackage.id;
    error.incompatible_rule_ids = incompatible;
    throw error;
  }

  return {
    id: rulePackage.id,
    customer_label: rulePackage.customer_label,
    allowed_rule_count: allowed.size,
    collection_overlay: collection === true
  };
}

export function rulePackageDefinitions() {
  return PACKAGE_DEFINITIONS;
}

export function collectionRuleIds() {
  return [...COLLECTION_RULE_IDS];
}
