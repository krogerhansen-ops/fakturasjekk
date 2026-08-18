import { createBackendServices } from './services.mjs';
import { createIdempotencyService } from './idempotency.mjs';
import { createAuditLogger } from './audit.mjs';
import { createCaseManagement } from './case-management.mjs';
import { createSupplierResponseService } from './supplier-response-service.mjs';
import { createPaymentWebhookService } from './payment-webhook-service.mjs';
import { evaluateReadiness } from './readiness.mjs';
import { createApi } from './api.mjs';
import { createNodeHandler, startNodeServer } from './node-runtime.mjs';

function required(value, name, method = null) {
  if (!value || (method && typeof value[method] !== 'function')) throw new Error(`Missing production adapter: ${name}`);
  return value;
}

export function createProductionApp({ config, product, registry, uploadPolicy, extractionPolicy, retentionPolicy, adapters = {} } = {}) {
  if (config?.environment !== 'production') throw new Error('Production app requires validated production config.');
  const caseStore = required(adapters.caseStore, 'caseStore', 'getOwned');
  const storage = required(adapters.storage, 'storage', 'reservePrivateObject');
  const extractor = required(adapters.extractor, 'extractor', 'extract');
  const responseInterpreter = required(adapters.responseInterpreter, 'responseInterpreter', 'interpret');
  const authAdapter = required(adapters.authAdapter, 'authAdapter', 'verifyBearer');
  const paymentGateway = required(adapters.paymentGateway, 'paymentGateway', 'verifyEvent');
  const paymentEventStore = required(adapters.paymentEventStore, 'paymentEventStore', 'claim');
  const idempotencyStore = required(adapters.idempotencyStore, 'idempotencyStore', 'put');
  const auditAdapter = required(adapters.auditAdapter, 'auditAdapter', 'write');
  const rateLimiter = required(adapters.rateLimiter, 'rateLimiter', 'check');

  const serviceAdapters = { caseStore, storage, extractor, responseInterpreter };
  const services = createBackendServices({ registry, product, uploadPolicy, extractionPolicy, retentionPolicy, adapters: serviceAdapters });
  const audit = createAuditLogger({ adapter: auditAdapter });
  const management = createCaseManagement({ caseStore, storage, audit });
  const supplierResponseService = createSupplierResponseService({ caseStore, services, interpreter: responseInterpreter });
  const idempotency = createIdempotencyService({ store: idempotencyStore });
  const paymentWebhookService = createPaymentWebhookService({ caseStore, services, gateway: paymentGateway, eventStore: paymentEventStore, audit });
  const readinessResult = evaluateReadiness({ product, registry, adapters: serviceAdapters, paymentGateway });
  if (!readinessResult.ready) {
    const failed = readinessResult.checks.filter(c => !c.ok).map(c => c.name).join(', ');
    throw new Error(`Production readiness failed: ${failed}`);
  }

  const readiness = () => evaluateReadiness({ product, registry, adapters: serviceAdapters, paymentGateway });
  const api = createApi({
    services,
    registry,
    management,
    supplierResponseService,
    paymentGateway,
    paymentWebhookService,
    paymentProviderName: paymentGateway.provider_name ?? config.payment_provider,
    allowedReturnOrigins: [config.app_origin],
    readiness,
    version: product.version,
    idempotency
  });
  const handler = createNodeHandler({ api, authAdapter, allowedOrigins: [config.app_origin], rateLimiter, production: true });
  return { handler, api, services, management, readiness: readinessResult };
}

export async function startProductionApp({ app, port = Number(process.env.PORT ?? 3000), host = process.env.HOST ?? '0.0.0.0' } = {}) {
  if (!app?.handler) throw new Error('Production app handler is required.');
  return startNodeServer({ handler: app.handler, port, host });
}
