import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('.');
const textExtensions = new Set(['.mjs', '.js', '.json', '.yml', '.yaml', '.md', '.html', '.txt', '.sql']);
const skipDirs = new Set(['.git', 'node_modules', '_site']);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      assert.notEqual(entry.name.toLowerCase(), '.claude', `Unexpected Claude config directory: ${rel}`);
      walk(full);
      continue;
    }
    assert.notEqual(entry.name.toLowerCase(), 'claude.md', `Unexpected Claude instruction file: ${rel}`);
    if (textExtensions.has(path.extname(entry.name).toLowerCase())) files.push({ full, rel });
  }
}
walk(root);

const patterns = [
  ['Anthropic API key', new RegExp(`${['sk','ant'].join('-')}-[A-Za-z0-9_-]{12,}`, 'i')],
  ['GitHub classic token', new RegExp(`${['ghp',''].join('_')}[A-Za-z0-9]{20,}`)],
  ['GitHub fine-grained token', new RegExp(`${['github','pat',''].join('_')}[A-Za-z0-9_]{20,}`)],
  ['private key material', new RegExp(['BEGIN', 'PRIVATE', 'KEY'].join(' '), 'i')],
  ['Claude web domain', new RegExp(['claude', 'ai'].join('\\.'), 'i')],
  ['Anthropic domain', new RegExp(['anthropic', 'com'].join('\\.'), 'i')]
];

for (const { full, rel } of files) {
  if (rel === 'tests/repository-hygiene.test.mjs') continue;
  const text = fs.readFileSync(full, 'utf8');
  for (const [name, re] of patterns) {
    assert.equal(re.test(text), false, `${name} found in ${rel}`);
  }
}

const workflows = fs.readdirSync(path.join(root, '.github', 'workflows')).filter(name => /\.ya?ml$/i.test(name)).sort();
assert.deepEqual(workflows, ['legal-source-watch.yml', 'pages.yml', 'quality.yml'], 'Unexpected GitHub Actions workflow added; review explicitly before allowlisting.');

console.log(`OK repository hygiene: ${files.length} textfiler kontrollert, workflows allowlistet.`);
