import fs from 'node:fs';
import { createBackendServices } from './services.mjs';
import { createMemoryCaseStore, createMemoryStorage, createMemoryIdempotencyStore, createMemoryAudit } from './reference-adapters.mjs';
import { createIdempotencyService } from './idempotency.mjs';
import { createAuditLogger } from './audit.mjs';
import { createCaseManagement } from './case-management.mjs';
import { createApi } from './api.mjs';
import { createDevelopmentAuthAdapter } from './auth-adapter.mjs';
import { createNodeHandler, startNodeServer } from './node-runtime.mjs';
import { createMemoryRateLimiter } from './security-policy.mjs';
import { createValidatedExtractor } from './extractor-contract.mjs';
import { createPaymentProviderGateway, createDevelopmentPaymentProvider } from './payment-provider-contract.mjs';
import { createPaymentWebhookService } from './payment-webhook-service.mjs';
import { evaluateReadiness } from './readiness.mjs';

if (process.env.NODE_ENV === 'production') throw new Error('dev-server cannot run in production');
const readJson = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const registry = readJson('../rules/rules.json');
const product = readJson('../config/product.json');
const uploadPolicy = readJson('../config/upload-policy.json');
const extractionPolicy = readJson('../config/extraction-policy.json');
const extractionCatalog = readJson('../config/extraction-fields.json');
const retentionPolicy = readJson('../config/retention-policy.json');

const caseStore = createMemoryCaseStore();
const storage = createMemoryStorage();
const auditAdapter = createMemoryAudit();
const audit = createAuditLogger({ adapter: auditAdapter });
const idempotency = createIdempotencyService({ store: createMemoryIdempotencyStore() });
const rawExtractor = {
  async extract({ documents }) {
    const invoice = documents.find(d => d.role === 'invoice');
    const quote = documents.find(d => d.role === 'quote') ?? invoice;
    return { fields: {
      invoice_total: { value: 146000, confidence: 0.99, source_document_id: invoice.id, source_page: 1 },
      invoice_number: { value: 'DEV-12345', confidence: 0.99, source_document_id: invoice.id, source_page: 1 },
      invoice_fee: { value: 500, confidence: 0.99, source_document_id: invoice.id, source_page: 1 },
      agreed_price: { value: 120000, confidence: 0.99, source_document_id: quote.id, source_page: 1 },
      price_basis: { value: 'estimate', confidence: 0.99, source_document_id: quote.id, source_page: 1 },
      surcharge_documented: { value: false, confidence: 0.90, source_document_id: quote.id, source_page: 1 }
    }};
  }
};
const extractor = createValidatedExtractor({ provider: rawExtractor, catalog: extractionCatalog });
const adapters = { caseStore, storage, extractor };
const services = createBackendServices({ registry, product, uploadPolicy, extractionPolicy, retentionPolicy, adapters });
const management = createCaseManagement({ caseStore, storage, audit });
const paymentProvider = createDevelopmentPaymentProvider({ name: 'dev-pay' });
const paymentGateway = createPaymentProviderGateway({ provider: paymentProvider, product, allowed_providers: ['dev-pay'] });
const paymentWebhookService = createPaymentWebhookService({ caseStore, services, gateway: paymentGateway, audit });
const readiness = () => evaluateReadiness({ product, registry, adapters, paymentGateway });
const api = createApi({
  services,
  registry,
  management,
  paymentGateway,
  paymentWebhookService,
  paymentProviderName: 'dev-pay',
  allowedReturnOrigins: ['http://localhost:5173', 'http://127.0.0.1:5500'],
  readiness,
  version: product.version,
  idempotency
});
const authAdapter = createDevelopmentAuthAdapter({ users: { 'dev-user-token': { id: 'dev-user', email: 'dev@fakturasjekk.local' } } });
const handler = createNodeHandler({ api, authAdapter, allowedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5500'], rateLimiter: createMemoryRateLimiter(), production: false });
const port = Number(process.env.PORT ?? 3000);
await startNodeServer({ handler, port, host: '127.0.0.1' });
console.log(`Fakturasjekk synthetic API running at http://127.0.0.1:${port}`);
console.log('Health: /health · Readiness: /ready');
console.log('Development bearer token: dev-user-token');
console.log('Development payment provider: dev-pay');
console.log('Synthetic data only. Do not upload real customer documents.');
