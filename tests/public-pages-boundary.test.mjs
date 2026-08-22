import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../site/index-launch-candidate.html', import.meta.url), 'utf8');
const cameraPage = fs.readFileSync(new URL('../site/camera-local-test.html', import.meta.url), 'utf8');
const cameraSheet = fs.readFileSync(new URL('../site/camera-test-sheet.html', import.meta.url), 'utf8');
const testerStart = fs.readFileSync(new URL('../site/tester-start.html', import.meta.url), 'utf8');
const testerFeedback = fs.readFileSync(new URL('../site/external-tester-feedback.html', import.meta.url), 'utf8');
const rootIndex = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.match(workflow, /Build explicitly allowlisted public artifact/);
assert.match(workflow, /cp site\/index-launch-candidate\.html _site\/index\.html/);
assert.equal(workflow.includes('cp -R site/* _site/site/'), false, 'Public Pages must never recursively publish the whole site tree.');

for (const required of [
  '_site/site/index-launch-candidate.html',
  '_site/site/camera-local-test.html',
  '_site/site/camera-test-sheet.html',
  '_site/site/tester-start.html',
  '_site/site/external-tester-feedback.html',
  '_site/site/app/camera-sanitizer.mjs',
  '_site/site/app/camera-quality.mjs',
  '_site/site/app/camera-local-test-page.mjs',
  '_site/site/app/camera-test-sheet-page.mjs',
  '_site/site/app/external-tester-feedback-page.mjs',
  '_site/site/engine/analyzer.mjs',
  '_site/site/engine/draft.mjs',
  '_site/site/rules/rules.json',
  '_site/site/data/demo-cases.json',
  '_site/site/config/product.json'
]) {
  assert.ok(workflow.includes(required), `Public Pages allowlist must explicitly include ${required}`);
}

for (const forbidden of [
  'cp server/', 'cp admin/', 'motor-test.html _site', 'flow-test.html _site', 'followup-test.html _site',
  'cp site/index-v025.html', 'cp site/index-v050.html', 'cp site/app/api-client.mjs',
  'cp site/app/document-intake.mjs', 'cp site/app/flow-state.mjs', 'cp site/app/upload-metadata.mjs'
]) {
  assert.equal(workflow.includes(forbidden), false, `Public Pages must not publish ${forbidden}`);
}
assert.match(workflow, /test ! -d _site\/server/);
assert.match(workflow, /test ! -d _site\/admin/);
assert.match(workflow, /test ! -f _site\/site\/index-v025\.html/);
assert.match(workflow, /test ! -f _site\/site\/index-v050\.html/);
assert.match(workflow, /test ! -f _site\/site\/app\/api-client\.mjs/);
assert.match(workflow, /test ! -f _site\/site\/app\/document-intake\.mjs/);
assert.match(workflow, /test ! -f _site\/site\/app\/flow-state\.mjs/);
assert.match(workflow, /test ! -f _site\/site\/app\/upload-metadata\.mjs/);

assert.match(page, /Launch Candidate/);
assert.match(page, /29 kr/);
assert.match(page, /Denne offentlige demosiden tar ikke imot ekte dokumenter/);
assert.match(page, /private produksjonsflyten er ferdig kontrollert og åpnet/);
assert.equal(/type=["']file["']/i.test(page), false, 'Public launch candidate must not present a real file input while production upload is disabled');
assert.equal(page.includes('camera-local-test.html'), false, 'local camera compatibility route must not become a customer upload CTA');
assert.equal(page.includes('tester-start.html'), false, 'external tester route must remain unlinked from customer launch candidate');
assert.equal(page.includes('/admin/rules'), false);
assert.equal(page.includes('motor-test.html'), false);
assert.equal(page.includes('flow-test.html'), false);

for (const [name, html] of [
  ['camera', cameraPage],
  ['camera-sheet', cameraSheet],
  ['tester-feedback', testerFeedback]
]) {
  assert.match(html, /Content-Security-Policy/, `${name} route must declare CSP`);
  assert.match(html, /connect-src 'none'/, `${name} route must block network connections`);
  assert.match(html, /meta name="referrer" content="no-referrer"/, `${name} route must suppress referrer leakage`);
}
assert.match(testerStart, /Content-Security-Policy/);
assert.match(testerStart, /script-src 'none'/);
assert.match(testerStart, /connect-src 'none'/);
assert.match(testerStart, /meta name="referrer" content="no-referrer"/);

assert.match(cameraPage, /Bildet forlater ikke enheten din/);
assert.match(cameraPage, /Ingen fil lastes opp/);
assert.match(cameraPage, /capture="environment"/);
assert.equal(cameraPage.includes('fetch('), false, 'camera compatibility route must remain local-only');
assert.match(cameraSheet, /SYNTETISK TEST – IKKE EKTE FAKTURA/);
assert.match(cameraSheet, /ingen betalingsverdi/i);
assert.equal(cameraSheet.includes('onclick='), false, 'camera sheet must not need inline event handlers');
assert.match(testerStart, /Takk for at du tester/);
assert.match(testerStart, /Ikke bruk ekte fakturaer eller personopplysninger/);
assert.match(testerFeedback, /Skjemaet lagrer eller sender ingenting/);
assert.equal(testerFeedback.includes('fetch('), false, 'tester feedback must remain local-only');

// GitHub Pages may be configured either from Actions or directly from main/(root).
// Root index must therefore never contain an old demo; it must point to the same launch candidate.
assert.match(rootIndex, /site\/index-launch-candidate\.html/);
assert.equal(rootIndex.includes('V0.20'), false, 'Root Pages entrypoint must not fall back to the old V0.20 demo');
assert.equal(rootIndex.includes('Ekstern test · V0.20'), false, 'Old external-test page must not be deployable from root');

console.log('OK public Pages is built from an explicit allowlist, keeps tester CSP boundaries and excludes legacy/internal client surfaces');
