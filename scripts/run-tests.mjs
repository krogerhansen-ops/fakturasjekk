import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const testDir = path.resolve('tests');
const files = fs.readdirSync(testDir)
  .filter(name => name.endsWith('.test.mjs'))
  .sort();

if (!files.length) {
  console.error('No tests found.');
  process.exit(1);
}

console.log(`Fakturasjekk quality gate: ${files.length} testfiler`);
for (const file of files) {
  console.log(`\n▶ ${file}`);
  const result = spawnSync(process.execPath, [path.join(testDir, file)], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\nFAIL: ${file}`);
    process.exit(result.status ?? 1);
  }
}
console.log(`\nOK: alle ${files.length} testfiler bestått.`);
