import fs from 'node:fs';
import assert from 'node:assert/strict';

const policy = JSON.parse(fs.readFileSync(new URL('../config/retention-policy.json', import.meta.url), 'utf8'));
const script = fs.readFileSync(new URL('../scripts/backup-supabase-free.sh', import.meta.url), 'utf8');
const runbook = fs.readFileSync(new URL('../docs/FREE-PLAN-BACKUP-RUNBOOK.md', import.meta.url), 'utf8');
const gitignore = fs.readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');

const backupDays = policy.backup_requirements.ordinary_rotating_backup_max_days_product_requirement;
const ledgerDays = policy.backup_requirements.deletion_ledger_ttl_days;
assert.equal(backupDays, 35);
assert.equal(ledgerDays, 45);
assert.ok(ledgerDays > backupDays, 'deletion ledger must outlive every ordinary rotating backup');
assert.equal(policy.backup_requirements.must_be_encrypted, true);
assert.equal(policy.backup_requirements.source_document_storage_is_not_part_of_standard_database_backup, true);
assert.equal(policy.backup_requirements.restore_must_reapply_deletion_ledger_before_user_access, true);

assert.match(script, /pg_dump/);
assert.match(script, /\| age --recipient/);
assert.match(script, /BACKUP_MAX_DAYS:-35/);
assert.match(script, /BACKUP_MAX_DAYS > 35/);
assert.match(script, /\.dump\.age/);
assert.equal(script.includes('SUPABASE_SECRET_KEY'), false);
assert.equal(script.includes('github-artifact'), false);
assert.equal(script.includes('actions/upload-artifact'), false);

assert.match(runbook, /ikke.*GitHub Actions artifacts/i);
assert.match(runbook, /45 dager/);
assert.match(runbook, /35 dager/);
assert.match(runbook, /reapplyDeletionTombstones/);
assert.match(runbook, /syntetiske data/i);

for (const pattern of ['backups/', '*.dump', '*.dump.age', '*.backup']) {
  assert.ok(gitignore.includes(pattern), `gitignore must block backup artifact pattern: ${pattern}`);
}

console.log('OK Free-plan backup policy is encrypted, bounded and restore-safe');
