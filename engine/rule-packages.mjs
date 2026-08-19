const PACKAGE_DEFINITIONS = Object.freeze({
  goods: Object.freeze({
    id: 'goods',
    customer_label: 'Varekjøp',
    base_routes: ['goods'],
    allowed_rule_ids: [
      'FKJL_37_PRICE_AND_FEE',
      'MFL_11_UNAGREED_PAYMENT',
      'BOF_5_1_1_SALES_DOC',
      'BOF_5_1_2_PARTIES'
    ]
  }),
  vehicle_repair: Object.freeze({
    id: 'vehicle_repair',
    customer_label: 'Bilverksted og reparasjon',
    base_routes: ['handcraft_service'],
    industries: ['vehicle_repair', 'auto_repair', 'car_workshop'],
    allowed_rule_ids: [
      'HTJL_7_DUTY_TO_ADVISE',
      'HTJL_9_ADDITIONAL_WORK',
      'HTJL_32_PRICE_ESTIMATE',
      'HTJL_33_SURCHARGE',
      'HTJL_34_PRELIMINARY_EXAMINATION',
      'HTJL_36_INVOICE',
      'MFL_11_UNAGREED_PAYMENT',
      'POF_10_SERVICE_PRICES',
      'POF_12_QUOTE',
      'POF_13_ITEMIZED_INVOICE',
      'BOF_5_1_1_SALES_DOC',
      'BOF_5_1_2_PARTIES'
    ]
  }),
  home_handcraft: Object.freeze({
    id: 'home_handcraft',
    customer_label: 'Håndverk og arbeid på bolig/ting',
    base_routes: ['handcraft_service'],
    allowed_rule_ids: [
      'HTJL_7_DUTY_TO_ADVISE',
      'HTJL_9_ADDITIONAL_WORK',
      'HTJL_32_PRICE_ESTIMATE',
      'HTJL_33_SURCHARGE',
      'HTJL_34_PRELIMINARY_EXAMINATION',
      'HTJL_36_INVOICE',
      'MFL_11_UNAGREED_PAYMENT',
      'POF_10_SERVICE_PRICES',
      'POF_12_QUOTE',
      'POF_13_ITEMIZED_INVOICE',
      'BOF_5_1_1_SALES_DOC',
      'BOF_5_1_2_PARTIES'
    ]
  }),
  other_service: Object.freeze({
    id: 'other_service',
    customer_label: 'Annen forbrukertjeneste',
    base_routes: ['service_quote'],
    allowed_rule_ids: [
      'MFL_11_UNAGREED_PAYMENT',
      'POF_10_SERVICE_PRICES',
      'POF_12_QUOTE',
      'POF_13_ITEMIZED_INVOICE',
      'BOF_5_1_1_SALES_DOC',
      'BOF_5_1_2_PARTIES'
    ]
  })
});

const COLLECTION_RULE_IDS = Object.freeze([
  'INK_8_GOOD_PRACTICE',
  'INK_9_NOTICE',
  'INK_10_PAYMENT_REQUEST',
  'INK_17_COLLECTION_COSTS'
]);

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function resolveRulePackage({ route, facts = {} } = {}) {
  const normalizedRoute = normalize(route);
  const industry = normalize(facts.industry);

  if (normalizedRoute === 'goods') return PACKAGE_DEFINITIONS.goods;
  if (normalizedRoute === 'service_quote') return PACKAGE_DEFINITIONS.other_service;
  if (normalizedRoute === 'handcraft_service') {
    if (PACKAGE_DEFINITIONS.vehicle_repair.industries.includes(industry)) {
      return PACKAGE_DEFINITIONS.vehicle_repair;
    }
    return PACKAGE_DEFINITIONS.home_handcraft;
  }
  return null;
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
