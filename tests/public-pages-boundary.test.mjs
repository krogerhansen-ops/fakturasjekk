import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../site/index-v050.html', import.meta.url), 'utf8');

assert.match(workflow, /site\/index-v050\.html/);
for (const forbidden of ['cp server/', 'cp admin/', 'motor-test.html _site', 'flow-test.html _site', 'followup-test.html _site']) {
  assert.equal(workflow.includes(forbidden), false, `Public Pages must not publish ${forbidden}`);
}
assert.match(workflow, /test ! -d _site\/server/);
assert.match(workflow, /test ! -d _site\/admin/);
assert.match(page, /Full sjekk \+ innsigelse: 29 kr/);
assert.match(page, /Produksjonsopplasting er ikke aktivert/);
assert.equal(/type=["']file["']/i.test(page), false, 'External demo must not present a real file input while production upload is disabled');
assert.equal(page.includes('/admin/rules'), false);
assert.equal(page.includes('motor-test.html'), false);
assert.equal(page.includes('flow-test.html'), false);

console.log('OK public Pages boundary');
