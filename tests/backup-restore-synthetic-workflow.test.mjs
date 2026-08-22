import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync(new URL('../.github/workflows/backup-restore-synthetic-verification.yml', import.meta.url), 'utf8');

assert.match(workflow, /workflow_dispatch:/);
assert.equal(/\npush:/.test(workflow), false, 'backup round-trip must never run automatically on push');
assert.equal(/\npull_request:/.test(workflow), false, 'backup round-trip must never run automatically on PR');
assert.equal(/\nschedule:/.test(workflow), false, 'synthetic backup verifier remains explicit/manual');
assert.match(workflow, /postgres:16-alpine/);
assert.match(workflow, /fakturasjekk_source_synthetic/);
assert.match(workflow, /fakturasjekk_restore_synthetic/);
assert.match(workflow, /SYNTHETIC_BACKUP_MARKER_ALPHA/);
assert.match(workflow, /SYNTHETIC_BACKUP_MARKER_BETA/);
assert.match(workflow, /backup-supabase-free\.sh/);
assert.match(workflow, /restore-backup-isolated\.sh/);
assert.match(workflow, /validate-isolated-restore-target\.mjs/);
assert.match(workflow, /db\.jxmkaxwflouacuboaetg\.supabase\.co/);
assert.match(workflow, /Production restore target was unexpectedly accepted/);
assert.match(workflow, /TARGET REMAINS QUARANTINED/);
assert.match(workflow, /Do NOT expose this database/);
assert.match(workflow, /source_digest/);
assert.match(workflow, /restore_digest/);
assert.match(workflow, /source_digest.*!=.*restore_digest/s);
assert.match(workflow, /grep -a -q 'SYNTHETIC_BACKUP_MARKER_'/);
assert.match(workflow, /Remove ephemeral backup and encryption identity/);
assert.match(workflow, /if:\s*\$\{\{ always\(\) \}\}/);
assert.match(workflow, /rm -rf/);
assert.equal(workflow.includes('secrets.DATABASE_URL'), false, 'synthetic round-trip must not receive production database credentials');
assert.equal(workflow.includes('SUPABASE_DB_PASSWORD'), false, 'synthetic round-trip must not receive production Supabase DB password');
assert.equal(workflow.includes('SUPABASE_ACCESS_TOKEN'), false, 'synthetic round-trip must not receive Supabase management access');
assert.equal(workflow.includes('actions/upload-artifact'), false, 'encrypted backup must not be published as a GitHub artifact');
assert.equal(workflow.includes('actions/download-artifact'), false);
assert.equal(workflow.includes('case-documents-private'), false, 'source document Storage is deliberately outside the ordinary database backup');
assert.equal(workflow.includes('customer'), false, 'workflow must stay synthetic-only and contain no customer-data path');

console.log('OK synthetic backup/restore workflow is manual, local-only, encrypted, quarantine-preserving and production-credential-free');
