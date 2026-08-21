import fs from 'node:fs';
import assert from 'node:assert/strict';

const runner = fs.readFileSync(new URL('../scripts/run-tests.mjs', import.meta.url), 'utf8');

assert.match(runner, /TEST_TIMEOUT_MS\s*=\s*30000/);
assert.match(runner, /timeout:\s*TEST_TIMEOUT_MS/);
assert.match(runner, /killSignal:\s*'SIGKILL'/);
assert.match(runner, /ETIMEDOUT/);
assert.match(runner, /TIMEOUT:/);
assert.match(runner, /process\.exit\(124\)/);

console.log('OK quality runner has a bounded 30-second timeout for every individual test file.');
