import fs from 'node:fs';
import assert from 'node:assert/strict';

const gate = JSON.parse(fs.readFileSync(new URL('../config/launch-gate.json', import.meta.url), 'utf8'));
const script = fs.readFileSync(new URL('../scripts/launch-status.mjs', import.meta.url), 'utf8');

const incomplete = gate.checks.filter(check => check.required && check.status !== 'complete');
assert.ok(incomplete.length > 0, 'launch must remain blocked until all required gates are complete');

for (const check of incomplete) {
  assert.ok(script.includes(`'${check.id}'`), `required incomplete gate is not classified by launch-status: ${check.id}`);
}

assert.match(script, /process\.exitCode = 2/);
assert.match(script, /BLOCKED: produksjonslansering forblir stengt/);
assert.match(script, /Kan bygges\/testes videre uten ny leverandørkonto/);
assert.match(script, /Avhenger av ekstern konto, virksomhetsinfo, avtale eller sign-off/);

console.log(`OK launch status classifies all ${incomplete.length} remaining required gates`);
