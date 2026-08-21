import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const testDir = path.resolve('tests');
const files = fs.readdirSync(testDir)
  .filter(name => name.endsWith('.test.mjs'))
  .sort();

const TEST_TIMEOUT_MS = 30000;

if (!files.length) {
  console.error('No tests found.');
  process.exit(1);
}

console.log(`Fakturasjekk quality gate: ${files.length} testfiler · maks ${TEST_TIMEOUT_MS / 1000}s per testfil`);
for (const file of files) {
  console.log(`\n▶ ${file}`);
  const result = spawnSync(process.execPath, [path.join(testDir, file)], {
    stdio: 'inherit',
    timeout: TEST_TIMEOUT_MS,
    killSignal: 'SIGKILL'
  });
  if (result.error?.code === 'ETIMEDOUT') {
    console.error(`\nTIMEOUT: ${file} brukte mer enn ${TEST_TIMEOUT_MS / 1000} sekunder.`);
    process.exit(124);
  }
  if (result.error) {
    console.error(`\nFAIL: ${file}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\nFAIL: ${file}`);
    process.exit(result.status ?? 1);
  }
}
console.log(`\nOK: alle ${files.length} testfiler bestått.`);
