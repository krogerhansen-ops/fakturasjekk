import fs from 'node:fs';
import assert from 'node:assert/strict';

const script = fs.readFileSync(new URL('../scripts/restore-backup-isolated.sh', import.meta.url), 'utf8');

const validationIndex = script.indexOf('node ./scripts/validate-isolated-restore-target.mjs');
const decryptIndex = script.indexOf('age --decrypt');
const restoreIndex = script.indexOf('| pg_restore');
assert.ok(validationIndex >= 0);
assert.ok(decryptIndex > validationIndex, 'restore target must be validated before backup decryption');
assert.ok(restoreIndex > decryptIndex, 'pg_restore must consume the decrypted stream only after validation');

assert.match(script, /RESTORE_CONFIRMATION/);
assert.match(script, /AGE_IDENTITY_FILE/);
assert.match(script, /--no-owner/);
assert.match(script, /--no-privileges/);
assert.match(script, /--clean/);
assert.match(script, /--if-exists/);
assert.match(script, /--exit-on-error/);
assert.match(script, /TARGET REMAINS QUARANTINED/);
assert.match(script, /reapplyDeletionTombstones/);
assert.match(script, /safe_to_open_restored_data=true/);
assert.doesNotMatch(script, />\s*[^|\n]*\.dump\b/, 'restore must not write a plaintext dump file');
assert.doesNotMatch(script, /mktemp/, 'restore stream does not need a plaintext temporary dump');

console.log('OK isolated restore script validates first, streams encrypted backup and keeps restored data quarantined');
