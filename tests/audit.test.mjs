import assert from 'node:assert/strict';
import { sanitizeAuditMetadata, createAuditLogger } from '../server/audit.mjs';
import { createMemoryAudit } from '../server/reference-adapters.mjs';

const sanitized = sanitizeAuditMetadata({
  state: 'analysis_ready',
  finding_count: 4,
  document_roles: ['invoice', 'quote'],
  user_note: 'skal aldri logges',
  document_text: 'sensitiv tekst',
  storage_key: 'private/u1/case-1/doc-1',
  email: 'person@example.no'
});
assert.equal(sanitized.state, 'analysis_ready');
assert.equal(sanitized.finding_count, 4);
assert.equal('user_note' in sanitized, false);
assert.equal('document_text' in sanitized, false);
assert.equal('storage_key' in sanitized, false);
assert.equal('email' in sanitized, false);

const adapter = createMemoryAudit();
const audit = createAuditLogger({ adapter, clock: () => new Date('2026-08-18T14:00:00Z') });
await audit.record({ actor_id: 'u1', case_id: 'case-1', action: 'case.analyze', metadata: { engine_version: '0.36.0', document_text: 'nope' } });
const entries = await adapter.list();
assert.equal(entries.length, 1);
assert.equal(entries[0].metadata.engine_version, '0.36.0');
assert.equal('document_text' in entries[0].metadata, false);

console.log('OK audit privacy');
