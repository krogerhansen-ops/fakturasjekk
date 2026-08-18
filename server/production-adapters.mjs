import { createPostgresCaseStore, createPostgresIdempotencyStore, createPostgresPaymentEventStore, createPostgresAuditAdapter } from './postgres-adapters.mjs';
import { createPostgresAtomicCounterStore } from './postgres-rate-limit.mjs';
import { createDistributedRateLimiter } from './distributed-rate-limit.mjs';
import { createPrivateObjectStorageAdapter } from './private-storage-adapter.mjs';
import { createJwtAuthAdapter } from './jwt-auth-contract.mjs';

export function createCoreProductionAdapters({
  config,
  db,
  storageProvider,
  storageScanner,
  jwtVerifier,
  extractor,
  responseInterpreter,
  paymentGateway
} = {}) {
  if (config?.environment !== 'production') throw new Error('Validated production config is required.');
  if (!db?.query) throw new Error('Production PostgreSQL connection is required.');
  if (!extractor?.extract) throw new Error('Production extractor is required.');
  if (!responseInterpreter?.interpret) throw new Error('Production response interpreter is required.');
  if (!paymentGateway?.createSession || !paymentGateway?.verifyEvent) throw new Error('Production payment gateway is required.');

  const caseStore = createPostgresCaseStore({ db });
  const idempotencyStore = createPostgresIdempotencyStore({ db });
  const paymentEventStore = createPostgresPaymentEventStore({ db });
  const auditAdapter = createPostgresAuditAdapter({ db });
  const counterStore = createPostgresAtomicCounterStore({ db });
  const rateLimiter = createDistributedRateLimiter({ counterStore });
  const storage = createPrivateObjectStorageAdapter({ provider: storageProvider, scanner: storageScanner, bucket: config.private_storage_bucket });
  const authAdapter = createJwtAuthAdapter({ verifier: jwtVerifier, issuer: config.auth_issuer, audience: config.auth_audience });

  return {
    caseStore,
    storage,
    extractor,
    responseInterpreter,
    authAdapter,
    paymentGateway,
    paymentEventStore,
    idempotencyStore,
    auditAdapter,
    rateLimiter
  };
}
