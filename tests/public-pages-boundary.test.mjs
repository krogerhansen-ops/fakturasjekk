import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../site/index-launch-candidate.html', import.meta.url), 'utf8');
const rootIndex = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.match(workflow, /site\/index-launch-candidate\.html/);
assert.match(workflow, /cp site\/index-launch-candidate\.html _site\/index\.html/);
assert.match(workflow, /cp -R site\/\* _site\/site\//);
assert.match(workflow, /test -f _site\/site\/index-launch-candidate\.html/);
assert.match(workflow, /test -f _site\/site\/engine\/analyzer\.mjs/);
assert.match(workflow, /test -f _site\/site\/engine\/draft\.mjs/);
assert.match(workflow, /test -f _site\/site\/rules\/rules\.json/);
assert.match(workflow, /test -f _site\/site\/data\/demo-cases\.json/);
assert.match(workflow, /test -f _site\/site\/config\/product\.json/);
for (const forbidden of ['cp server/', 'cp admin/', 'motor-test.html _site', 'flow-test.html _site', 'followup-test.html _site']) {
  assert.equal(workflow.includes(forbidden), false, `Public Pages must not publish ${forbidden}`);
}
assert.match(workflow, /test ! -d _site\/server/);
assert.match(workflow, /test ! -d _site\/admin/);

assert.match(page, /Launch Candidate/);
assert.match(page, /29 kr/);
assert.match(page, /Denne offentlige demosiden tar ikke imot ekte dokumenter/);
assert.match(page, /private produksjonsflyten er ferdig kontrollert og åpnet/);
assert.equal(/type=["']file["']/i.test(page), false, 'Public launch candidate must not present a real file input while production upload is disabled');
assert.equal(page.includes('/admin/rules'), false);
assert.equal(page.includes('motor-test.html'), false);
assert.equal(page.includes('flow-test.html'), false);

// GitHub Pages may be configured either from Actions or directly from main/(root).
// Root index must therefore never contain an old demo; it must point to the same launch candidate.
assert.match(rootIndex, /site\/index-launch-candidate\.html/);
assert.equal(rootIndex.includes('V0.20'), false, 'Root Pages entrypoint must not fall back to the old V0.20 demo');
assert.equal(rootIndex.includes('Ekstern test · V0.20'), false, 'Old external-test page must not be deployable from root');

console.log('OK public Pages launch-candidate boundary, root fallback and demo dependencies');
