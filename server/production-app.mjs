import { createBackendServices } from './services.mjs';
import { createIdempotencyService } from './idempotency.mjs';
import { createAuditLogger } from './audit.mjs';
import { createCaseManagement } from './case-management.mjs';
import { createSupplierResponseService } from './supplier-response-service.mjs';
import { createPaymentWebhookService } from './payment-webhook-service.mjs';
import { createCheckoutConsentService } from './checkout-consent-service.mjs';
import { createOrderConfirmationService } from './order-confirmation-service.mjs';
import { createOrderConfirmationDeliveryService } from './order-confirmation-delivery-service.mjs';
import { createOrderConfirmationDeliveryRetryService } from './order-confirmation-delivery-retry-service.mjs';
import { createOutboundDeliveryService } from './outbound-delivery-service.mjs';
import { evaluateReadiness } from './readiness.mjs';
import { evaluateLaunchGate } from './launch-gate.mjs';
import { createApi } from './api.mjs';
import { createNodeHandler, startNodeServer } from './node-runtime.mjs';
import { createFetchHandler } from './fetch-runtime.mjs';

function required(value, name, method = null) {
  if (!value || (method && typeof value[method] !== 'function')) throw new Error(`Missing production adapter: ${name}`);
  return value;
}

export function createProductionApp({
  config,
  product,
  registry,
  uploadPolicy,
  extractionPolicy,
  extractionCatalog,
  retentionPolicy,
  checkoutPolicy = null,
  launchGate,
  adapters = {},
  edgeBasePath = '/functions/v1/fakturasjekk-api'
} = {}) {
  if (config?.environment !== 'production') throw new Error('Production app requires validated production config.');
  const launchGateResult = evaluateLaunchGate(launchGate ?? {});
  if (!launchGate || !launchGateResult.valid || !launchGateResult.launch_allowed) {
    const blocking = launchGateResult.blocking_ids?.join(', ') || 'launch_gate_missing_or_invalid';
    throw new Error(`Production launch gate blocked: ${blocking}`);
  }

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
  const backendServices = createBackendServices({
    registry,
    product,
    uploadPolicy,
    extractionPolicy,
    extractionCatalog,
    retentionPolicy,
    adapters: serviceAdapters
  });
  const outboundDeliveryService = createOutboundDeliveryService({ caseStore });
  const services = { ...backendServices, markOutboundSent: outboundDeliveryService.markSent };
  const audit = createAuditLogger({ adapter: auditAdapter });
  const management = createCaseManagement({ caseStore, storage, audit });
  const supplierResponseService = createSupplierResponseService({ caseStore, services, interpreter: responseInterpreter });
  const idempotency = createIdempotencyService({ store: idempotencyStore });
  const orderConfirmationService = checkoutPolicy ? createOrderConfirmationService({ caseStore, checkoutPolicy }) : null;
  const orderConfirmationDeliveryService = orderConfirmationService && adapters.orderConfirmationDeliveryAdapter
    ? createOrderConfirmationDeliveryService({
        orderConfirmationService,
        deliveryAdapter: adapters.orderConfirmationDeliveryAdapter
      })
    : null;
  const orderConfirmationDeliveryRetryService = orderConfirmationDeliveryService && typeof caseStore.listPendingOrderConfirmationDeliveries === 'function'
    ? createOrderConfirmationDeliveryRetryService({
        caseStore,
        deliveryService: orderConfirmationDeliveryService,
        audit
      })
    : null;
  const paymentWebhookService = createPaymentWebhookService({
    caseStore,
    services,
    gateway: paymentGateway,
    eventStore: paymentEventStore,
    audit,
    orderConfirmationService,
    orderConfirmationDeliveryService
  });
  const checkoutConsentService = checkoutPolicy ? createCheckoutConsentService({ caseStore, policy: checkoutPolicy }) : null;
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
    checkoutConsentService,
    orderConfirmationService,
    allowedReturnOrigins: [config.app_origin],
    readiness,
    version: product.version,
    idempotency
  });
  const handler = createNodeHandler({ api, authAdapter, allowedOrigins: [config.app_origin], rateLimiter, production: true });
  const fetchHandler = createFetchHandler({
    api,
    authAdapter,
    allowedOrigins: [config.app_origin],
    rateLimiter,
    production: true,
    basePath: edgeBasePath
  });
  return {
    handler,
    fetchHandler,
    api,
    services,
    management,
    orderConfirmationService,
    orderConfirmationDeliveryService,
    orderConfirmationDeliveryRetryService,
    outboundDeliveryService,
    readiness: readinessResult,
    launch_gate: launchGateResult
  };
}

export async function startProductionApp({ app, port = Number(process.env.PORT ?? 3000), host = process.env.HOST ?? '0.0.0.0' } = {}) {
  if (!app?.handler) throw new Error('Production app handler is required.');
  return startNodeServer({ handler: app.handler, port, host });
}
