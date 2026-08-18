import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../site/index-launch-candidate.html', import.meta.url), 'utf8');

assert.match(workflow, /site\/index-launch-candidate\.html/);
for (const forbidden of ['cp server/', 'cp admin/', 'motor-test.html _site', 'flow-test.html _site', 'followup-test.html _site']) {
  assert.equal(workflow.includes(forbidden), false, `Public Pages must not publish ${forbidden}`);
}
assert.match(workflow, /test ! -d _site\/server/);
assert.match(workflow, /test ! -d _site\/admin/);
assert.match(page, /Launch Candidate/);
assert.match(page, /29 kr/);
assert.match(page, /Denne offentlige RC-siden tar ikke imot ekte dokumenter/);
assert.equal(/type=["']file["']/i.test(page), false, 'Public launch candidate must not present a real file input while production upload is disabled');
assert.equal(page.includes('/admin/rules'), false);
assert.equal(page.includes('motor-test.html'), false);
assert.equal(page.includes('flow-test.html'), false);

console.log('OK public Pages launch-candidate boundary');
