import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist-cloudflare');

fs.rmSync(out, { recursive: true, force: true });
for (const dir of ['engine', 'rules', 'data', 'config']) {
  fs.mkdirSync(path.join(out, dir), { recursive: true });
}

const files = [
  ['site/index-launch-candidate.html', 'index.html'],
  ['engine/analyzer.mjs', 'engine/analyzer.mjs'],
  ['engine/draft.mjs', 'engine/draft.mjs'],
  ['rules/rules.json', 'rules/rules.json'],
  ['data/demo-cases.json', 'data/demo-cases.json'],
  ['config/product.json', 'config/product.json'],
  ['cloudflare/_headers', '_headers']
];

for (const [source, target] of files) {
  const src = path.join(root, source);
  if (!fs.existsSync(src)) throw new Error(`Missing Cloudflare build input: ${source}`);
  fs.copyFileSync(src, path.join(out, target));
}

const forbiddenNames = ['server', 'admin', 'supabase', '.env', 'motor-test.html', 'flow-test.html', 'followup-test.html'];
for (const name of forbiddenNames) {
  if (fs.existsSync(path.join(out, name))) throw new Error(`Forbidden production frontend artifact: ${name}`);
}

const forbiddenText = [
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL=',
  'VIPPS_CLIENT_SECRET',
  'VIPPS_SUBSCRIPTION_KEY',
  'VIPPS_WEBHOOK_SECRET',
  'GOOGLE_SERVICE_ACCOUNT_JSON'
];

function textFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...textFiles(full));
    else if (/\.(html|mjs|js|json|css|txt|headers)$/i.test(entry.name) || entry.name === '_headers') result.push(full);
  }
  return result;
}

for (const file of textFiles(out)) {
  const content = fs.readFileSync(file, 'utf8');
  for (const marker of forbiddenText) {
    if (content.includes(marker)) throw new Error(`Secret marker ${marker} found in Cloudflare artifact: ${path.relative(out, file)}`);
  }
}

console.log(`OK Cloudflare static artifact: ${files.length} allowlisted files copied to dist-cloudflare`);
console.log('Customer upload/payment/API remain disabled until launch gates are complete.');
