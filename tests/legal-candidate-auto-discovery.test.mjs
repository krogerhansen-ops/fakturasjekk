import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { discoverPreactivationRegistries } from '../scripts/legal-candidate-discovery.mjs';

function rule(id) {
  return {
    id,
    status: 'preactivation_candidate',
    source_url: 'https://lovdata.no/lov/2000-01-01-1',
    expected_phrase: 'syntetisk kontrollfrase',
    conditions: ['Må ha dokumentert aktiveringsgrunnlag.']
  };
}

function registry(rules, extra = {}) {
  return { runtime: false, purpose: 'preactivation_only', rules, ...extra };
}

function writeJson(dir, name, value) {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value), 'utf8');
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fakturasjekk-candidates-'));
try {
  writeJson(dir, 'specialist-candidates.json', registry([rule('A_RULE')]));
  writeJson(dir, 'future-sector-candidates.json', registry([rule('B_RULE')]));
  writeJson(dir, 'not-a-candidate.json', registry([rule('IGNORED_RULE')]));
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignore', 'utf8');

  const found = discoverPreactivationRegistries(dir);
  assert.deepEqual(found.registries.map(item => item.name), ['future-sector-candidates.json', 'specialist-candidates.json']);
  assert.deepEqual(found.rules.map(item => item.id), ['B_RULE', 'A_RULE']);
  assert.equal(found.rules.find(item => item.id === 'B_RULE').registry_file, 'future-sector-candidates.json');
  assert.equal(found.rules.some(item => item.id === 'IGNORED_RULE'), false);

  writeJson(dir, 'duplicate-candidates.json', registry([rule('A_RULE')]));
  assert.throws(() => discoverPreactivationRegistries(dir), /Duplicate legal rule id/);
  fs.rmSync(path.join(dir, 'duplicate-candidates.json'));

  writeJson(dir, 'unsafe-candidates.json', registry([rule('UNSAFE_RULE')], { runtime: true }));
  assert.throws(() => discoverPreactivationRegistries(dir), /must remain isolated from runtime/);
  fs.rmSync(path.join(dir, 'unsafe-candidates.json'));

  writeJson(dir, 'missing-conditions-candidates.json', registry([{ ...rule('NO_CONDITIONS'), conditions: [] }]));
  assert.throws(() => discoverPreactivationRegistries(dir), /document activation conditions/);
  fs.rmSync(path.join(dir, 'missing-conditions-candidates.json'));

  writeJson(dir, 'missing-source-candidates.json', registry([{ ...rule('NO_SOURCE'), source_url: '' }]));
  assert.throws(() => discoverPreactivationRegistries(dir), /requires source_url and expected_phrase/);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fakturasjekk-empty-candidates-'));
try {
  assert.throws(() => discoverPreactivationRegistries(emptyDir), /At least one isolated/);
} finally {
  fs.rmSync(emptyDir, { recursive: true, force: true });
}

const sourceWatch = fs.readFileSync(new URL('../scripts/legal-source-check.mjs', import.meta.url), 'utf8');
assert.match(sourceWatch, /discoverPreactivationRegistries/);
assert.equal(sourceWatch.includes("../rules/specialist-candidates.json"), false, 'source watch must not hard-code one candidate registry path');
assert.match(sourceWatch, /preactivation:\$\{rule\.registry_file\}/);

console.log('OK legal source watch auto-discovers every isolated *-candidates.json registry and fails closed on unsafe registries.');
