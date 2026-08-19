import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('site/index-launch-candidate.html', 'utf8');
const constitution = fs.readFileSync('docs/PRODUCT-CONSTITUTION.md', 'utf8');

assert.match(html, /id="passer"/, 'launch candidate must expose a supported-invoice overview');
assert.match(html, /Du kan starte med bare fakturaen/, 'customer must understand that invoice-only is enough to start');
assert.match(html, /Har du bare fakturaen\?/, 'invoice-only path must be explained explicitly');

for (const label of [
  'Håndverker og oppussing',
  'Elektriker',
  'Rørlegger og VVS',
  'Bilverksted og bilservice',
  'Flytting og transport',
  'Renhold og servicetjenester',
  'Montering og installasjon',
  'Andre forbrukerfakturaer'
]) {
  assert.ok(html.includes(label), `missing supported invoice category: ${label}`);
}

assert.match(html, /Dette har vi kontrollert/, 'result must explain control coverage');
assert.match(html, /id="coverageDone"/, 'result must have a controlled-items container');
assert.match(html, /id="coverageMissing"/, 'result must have an unavailable-items container');
assert.match(html, /MVA-grunnlaget er ikke med i denne demosaken/, 'demo must not imply MVA was checked without evidence');
assert.match(html, /Demosaken har ikke organisasjonsnummer for registeroppslag/, 'demo must not imply company lookup without data');

assert.ok(!html.includes('Fail-closed rettskilder'), 'customer-facing copy must not expose fail-closed developer terminology');
assert.ok(!html.includes('deterministiske analysemotor'), 'customer-facing copy must avoid implementation jargon');
assert.match(html, /Regler kontrollert mot Lovdata/, 'customer-facing source wording must stay factual');

assert.match(constitution, /Faktura alene skal være nok til å starte/, 'constitution must preserve invoice-only entry rule');
assert.match(constitution, /Brukeropplysninger skal aldri automatisk oppgraderes til dokumentert bevis/, 'constitution must preserve evidence separation');
assert.match(constitution, /Tilleggsarbeid er et eget hovedområde/, 'constitution must elevate additional work to a main analysis area');
assert.match(constitution, /Kontroll-dekning i resultatet/, 'constitution must require explicit coverage reporting');
assert.match(constitution, /regelsettet og kildeversjonene/, 'constitution must freeze the rule basis per analysis');
assert.match(constitution, /Funn skal prioriteres etter vesentlighet/, 'constitution must require materiality');
assert.match(constitution, /P-listen er produktretning, ikke launch-rekkefølge/, 'product roadmap must not override launch order');
assert.match(constitution, /`docs\/NEXT-TO-LIVE\.md` styrer hva som gjøres først/, 'operational launch order must remain authoritative');

console.log('OK: supported invoice overview, transparent result coverage and product constitution are protected.');
