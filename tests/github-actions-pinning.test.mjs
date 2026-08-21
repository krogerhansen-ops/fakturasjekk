import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const workflowsDir = path.resolve('.github/workflows');
const workflowFiles = fs.readdirSync(workflowsDir)
  .filter(name => /\.ya?ml$/i.test(name))
  .sort();

assert.ok(workflowFiles.length > 0, 'GitHub workflows must exist');

for (const file of workflowFiles) {
  const source = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const match = line.match(/^\s*-?\s*uses:\s*([^\s#]+)/);
    if (!match) continue;
    const target = match[1];
    if (target.startsWith('./')) continue;
    const at = target.lastIndexOf('@');
    assert.ok(at > 0, `${file}:${index + 1} action reference must include @SHA`);
    const revision = target.slice(at + 1);
    assert.match(revision, /^[0-9a-f]{40}$/, `${file}:${index + 1} external action must be pinned to a full 40-character commit SHA, got ${revision}`);
  }

  if (source.includes('actions/checkout@')) {
    assert.match(
      source,
      /uses:\s*actions\/checkout@[0-9a-f]{40}[^\n]*\n\s*with:\s*\n\s*persist-credentials:\s*false/,
      `${file}: checkout must not persist repository credentials`
    );
  }
}

const dependabot = fs.readFileSync(path.resolve('.github/dependabot.yml'), 'utf8');
assert.match(dependabot, /package-ecosystem:\s*github-actions/);
assert.match(dependabot, /interval:\s*weekly/);

console.log(`OK ${workflowFiles.length} GitHub workflows pin external Actions by immutable SHA and checkout credentials are not persisted.`);
