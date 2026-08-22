import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');

assert.match(workflow, /Content-Security-Policy/);
assert.match(workflow, /default-src 'self'/);
assert.match(workflow, /script-src 'self' 'unsafe-inline'/);
assert.match(workflow, /style-src 'self' 'unsafe-inline'/);
assert.match(workflow, /connect-src 'self'/);
assert.match(workflow, /object-src 'none'/);
assert.match(workflow, /base-uri 'none'/);
assert.match(workflow, /form-action 'none'/);
assert.match(workflow, /name=\"referrer\" content=\"no-referrer\"/);
assert.match(workflow, /CSP unexpectedly already exists/);
assert.match(workflow, /grep -q 'Content-Security-Policy' _site\/index\.html/);
assert.match(workflow, /grep -q \"connect-src 'self'\" _site\/index\.html/);
assert.equal(workflow.includes("connect-src *"), false);
assert.equal(workflow.includes("script-src *"), false);

console.log('OK public synthetic demo receives a fail-closed build-time browser policy on GitHub Pages');
