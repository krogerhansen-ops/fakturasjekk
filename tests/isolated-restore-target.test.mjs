import assert from 'node:assert/strict';
import { validateIsolatedRestoreTarget } from '../scripts/validate-isolated-restore-target.mjs';

const confirmation = 'I_UNDERSTAND_ISOLATED_RESTORE_ONLY';

let result = validateIsolatedRestoreTarget({
  databaseUrl: 'postgresql://postgres:secret@db.jxmkaxwflouacuboaetg.supabase.co:5432/postgres',
  targetProjectRef: 'jxmkaxwflouacuboaetg',
  confirmation
});
assert.equal(result.safe, false);
assert.ok(result.errors.some(error => /Production Fakturasjekk Supabase project is forbidden/.test(error)));

result = validateIsolatedRestoreTarget({
  databaseUrl: 'postgresql://postgres:secret@localhost:5432/fakturasjekk_restore',
  confirmation
});
assert.equal(result.safe, true);
assert.equal(result.target.project_ref, 'local');

result = validateIsolatedRestoreTarget({
  databaseUrl: 'postgresql://postgres:secret@db.abcdefghijklmnop.supabase.co:5432/postgres',
  targetProjectRef: 'abcdefghijklmnop',
  confirmation
});
assert.equal(result.safe, true);
assert.equal(result.target.project_ref, 'abcdefghijklmnop');

result = validateIsolatedRestoreTarget({
  databaseUrl: 'postgresql://postgres:secret@db.abcdefghijklmnop.supabase.co:5432/postgres',
  targetProjectRef: 'differentproject',
  confirmation
});
assert.equal(result.safe, false);
assert.ok(result.errors.some(error => /do not match/.test(error)));

result = validateIsolatedRestoreTarget({
  databaseUrl: 'https://localhost/fakturasjekk_restore',
  confirmation
});
assert.equal(result.safe, false);
assert.ok(result.errors.some(error => /must use PostgreSQL/.test(error)));

result = validateIsolatedRestoreTarget({
  databaseUrl: 'postgresql://localhost/fakturasjekk_restore',
  confirmation: ''
});
assert.equal(result.safe, false);
assert.ok(result.errors.some(error => /confirmation is required/.test(error)));

result = validateIsolatedRestoreTarget({
  databaseUrl: 'postgresql://postgres:secret@evil-jxmkaxwflouacuboaetg.example.test:5432/postgres',
  targetProjectRef: 'safe-looking-ref',
  confirmation
});
assert.equal(result.safe, false, 'any host containing the production project ref must be refused');

console.log('OK isolated restore target validator refuses production and requires an explicit isolated destination');
