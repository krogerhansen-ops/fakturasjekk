export function evaluateReadiness({ product, registry, adapters = {}, paymentGateway = null } = {}) {
  const checks = [];
  const add = (name, ok, message) => checks.push({ name, ok: ok === true, message });

  add('product.price', Number(product?.price_nok) === 29 && product?.full_check_free === false,
    'Full sjekk + innsigelse skal koste 29 kr og skal ikke være konfigurert som gratis.');
  add('product.market', product?.market === 'NO' && product?.audience === 'consumer',
    'V1 skal være konfigurert for norske forbrukere.');
  const activeRules = (registry?.rules ?? []).filter(rule => rule.status === 'active');
  add('rules.active', activeRules.length > 0, 'Minst én aktiv, versjonert regel må være tilgjengelig.');
  add('rules.sources', activeRules.every(rule => /^https:\/\/lovdata\.no\//.test(rule.source_url ?? '') && rule.last_verified),
    'Alle aktive regler må ha Lovdata-kilde og kontrolldato.');
  add('case_store', Boolean(adapters.caseStore?.getOwned && adapters.caseStore?.save), 'Sakslagring må være konfigurert.');
  add('private_storage', Boolean(adapters.storage?.reservePrivateObject && adapters.storage?.listCaseDocuments), 'Privat dokumentlagring må være konfigurert.');
  add('extractor', Boolean(adapters.extractor?.extract), 'Dokumenttolk må være konfigurert.');
  add('payment_gateway', Boolean(paymentGateway?.createSession && paymentGateway?.verifyEvent), 'Server-verifisert betalingsgateway må være konfigurert.');

  const failed = checks.filter(check => !check.ok);
  return {
    ready: failed.length === 0,
    status: failed.length === 0 ? 'ready' : 'not_ready',
    checks,
    failed_count: failed.length,
    active_rule_count: activeRules.length
  };
}

export function publicReadiness(result) {
  return {
    ready: result.ready,
    status: result.status,
    checks: result.checks.map(check => ({ name: check.name, ok: check.ok })),
    failed_count: result.failed_count,
    active_rule_count: result.active_rule_count
  };
}
