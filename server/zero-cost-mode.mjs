const FREE_PROVIDER_VALUES = new Set(['', 'unset', 'disabled', 'none', 'manual', 'synthetic', 'local']);

function value(env, name) {
  return typeof env?.[name] === 'string' ? env[name].trim() : '';
}

function enabledFlag(env, name) {
  return /^(1|true|yes|on)$/i.test(value(env, name));
}

function freeProvider(name) {
  return FREE_PROVIDER_VALUES.has(String(name || '').trim().toLowerCase());
}

export function evaluateZeroCostMode(env = process.env) {
  const mode = (value(env, 'FAKTURASJEKK_COST_MODE') || 'zero').toLowerCase();
  if (!['zero', 'funded'].includes(mode)) {
    throw new Error('FAKTURASJEKK_COST_MODE must be zero or funded.');
  }

  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: ok === true, detail });

  if (mode === 'zero') {
    add('customer_upload_disabled', !enabledFlag(env, 'CUSTOMER_UPLOAD_ENABLED'), 'Public customer upload must stay disabled in zero-cost mode.');
    add('production_api_disabled', !enabledFlag(env, 'PRODUCTION_API_ENABLED'), 'Production API must stay disabled in zero-cost mode.');
    add('payment_provider_free', freeProvider(value(env, 'PAYMENT_PROVIDER')), 'Payment provider must stay unset/disabled in zero-cost mode.');
    add('document_extractor_free', freeProvider(value(env, 'DOCUMENT_EXTRACTOR_PROVIDER')), 'Document extractor must be unset/manual/synthetic/local in zero-cost mode.');
    add('response_interpreter_free', freeProvider(value(env, 'RESPONSE_INTERPRETER_PROVIDER')), 'Response interpreter must be unset/manual/synthetic/local in zero-cost mode.');
    add('vipps_not_production', (value(env, 'VIPPS_ENVIRONMENT') || 'test').toLowerCase() !== 'production', 'Vipps production environment must not be selected in zero-cost mode.');
    add('paid_services_not_approved', !/^(1|true|yes|approved)$/i.test(value(env, 'FAKTURASJEKK_PAID_SERVICES_APPROVED')), 'Paid services must not be approved in zero-cost mode.');
  } else {
    add('paid_services_approved', /^(1|true|yes|approved)$/i.test(value(env, 'FAKTURASJEKK_PAID_SERVICES_APPROVED')), 'Funded mode requires explicit approval for paid services.');
  }

  const failed = checks.filter(check => !check.ok);
  return {
    mode,
    zero_cost: mode === 'zero',
    paid_network_calls_allowed: mode === 'funded' && failed.length === 0,
    safe: failed.length === 0,
    failed_count: failed.length,
    checks
  };
}

export function assertZeroCostSafe(env = process.env) {
  const result = evaluateZeroCostMode(env);
  if (!result.safe) {
    const names = result.checks.filter(check => !check.ok).map(check => check.name).join(', ');
    throw new Error(`Fakturasjekk cost guard blocked configuration: ${names}`);
  }
  return result;
}

export function assertPaidNetworkCallAllowed(env = process.env, service = 'paid service') {
  const result = evaluateZeroCostMode(env);
  if (!result.paid_network_calls_allowed) {
    throw new Error(`${service} is blocked until Fakturasjekk is explicitly switched to funded mode.`);
  }
  return true;
}

export const ZERO_COST_ALLOWED_COMPONENTS = Object.freeze([
  'github_pages',
  'github_actions_within_free_allowance',
  'existing_supabase_free_allowance',
  'brreg_public_api',
  'synthetic_test_data',
  'manual_or_local_extraction'
]);
