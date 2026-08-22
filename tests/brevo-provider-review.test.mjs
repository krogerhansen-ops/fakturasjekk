import fs from 'node:fs';
import assert from 'node:assert/strict';

const review = fs.readFileSync(new URL('../docs/BREVO-PROVIDER-REVIEW-2026-08-22.md', import.meta.url), 'utf8');
const gate = JSON.parse(fs.readFileSync(new URL('../config/launch-gate.json', import.meta.url), 'utf8'));
const byId = new Map(gate.checks.map(check => [check.id, check]));

assert.match(review, /IKKE GODKJENT FOR EKTE KUNDEDATA/);
assert.match(review, /ikke juridisk godkjenning/i);
assert.match(review, /serververifisert mottaker-e-post/i);
assert.match(review, /ikke.*opplastet faktura/is);
assert.match(review, /OVH.*Frankrike.*Tyskland/is);
assert.match(review, /Google Cloud.*Belgia/is);
assert.match(review, /kortlivede individuelle public-key certificates/i);
assert.match(review, /2FA.*skal.*aktiveres/is);
assert.match(review, /standard SMTP uten tilsvarende transportkryptering/i, 'opportunistic TLS residual risk must remain explicit');
assert.match(review, /ikke kan hevde ende-til-ende- eller garantert transportkryptering/i);
assert.match(review, /transactional retention/i);
assert.match(review, /kontoaktuell offentlig underleverandørliste/i);
assert.match(review, /eldre Sendinblue\/Brevo-DPA.*ikke.*dagens underleverandørkjede/is, 'stale historical DPA must never be promoted as current evidence');
assert.match(review, /transfer\/subprocessor review = `in_progress`, ikke `complete`/);
assert.match(review, /Brevo kan fortsatt være valgt teknisk kandidat, men ekte kundedata og kundebetaling skal forbli blokkert/i);

for (const url of [
  'https://help.brevo.com/hc/en-us/articles/15403782599570-Where-can-I-find-the-Data-Processing-Agreement-DPA',
  'https://help.brevo.com/hc/en-us/articles/360001005510-Data-storage-location',
  'https://help.brevo.com/hc/en-us/articles/360001005830-Access-to-data',
  'https://help.brevo.com/hc/en-us/articles/115000202824-Email-encryption',
  'https://help.brevo.com/hc/en-us/articles/208677629-Permanently-close-your-Brevo-account'
]) {
  assert.ok(review.includes(url), `provider review missing primary source ${url}`);
}

const agreements = byId.get('LEGAL_PROCESSOR_AGREEMENTS');
const transfers = byId.get('LEGAL_TRANSFER_ASSESSMENT');
assert.ok(agreements, 'missing processor agreement gate');
assert.ok(transfers, 'missing transfer assessment gate');
assert.notEqual(agreements.status, 'complete', 'public DPA availability must never equal approved processor agreement');
assert.notEqual(transfers.status, 'complete', 'EU database hosting must never equal completed transfer assessment');

console.log('OK Brevo provider review records primary-source evidence, opportunistic-TLS risk and unresolved DPA/subprocessor/transfer blockers without overclaiming approval.');
