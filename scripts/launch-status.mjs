import fs from 'node:fs';

const gate = JSON.parse(fs.readFileSync(new URL('../config/launch-gate.json', import.meta.url), 'utf8'));

const EXTERNAL = new Set([
  'TECH_PRODUCTION_HOSTING',
  'TECH_AUTH_PROVIDER',
  'TECH_DOCUMENT_EXTRACTOR',
  'TECH_RESPONSE_INTERPRETER',
  'TECH_PAYMENT_PROVIDER_WEBHOOK',
  'LEGAL_DPIA_COMPLETE',
  'LEGAL_PROCESSING_BASIS_MAP',
  'LEGAL_ROPA',
  'LEGAL_PRIVACY_NOTICE',
  'LEGAL_PROCESSOR_REGISTER',
  'LEGAL_PROCESSOR_AGREEMENTS',
  'LEGAL_TRANSFER_ASSESSMENT',
  'LEGAL_RETENTION_APPROVAL',
  'LEGAL_DATA_SUBJECT_WORKFLOW',
  'LEGAL_INCIDENT_RESPONSE',
  'COMMERCE_SELLER_IDENTITY',
  'COMMERCE_TERMS',
  'COMMERCE_PRIVACY_AT_CHECKOUT',
  'COMMERCE_CANCELLATION_IMPLEMENTATION',
  'COMMERCE_RECEIPT_FLOW',
  'QA_EXTERNAL_TESTERS'
]);

const TECHNICAL = new Set([
  'TECH_PRIVATE_OBJECT_STORAGE',
  'TECH_DISTRIBUTED_RATE_LIMIT',
  'TECH_BACKUP_RETENTION_TEST',
  'TECH_DELETE_END_TO_END_TEST'
]);

const required = gate.checks.filter(check => check.required);
const complete = required.filter(check => check.status === 'complete');
const incomplete = required.filter(check => check.status !== 'complete');
const external = incomplete.filter(check => EXTERNAL.has(check.id));
const technical = incomplete.filter(check => TECHNICAL.has(check.id));
const unclassified = incomplete.filter(check => !EXTERNAL.has(check.id) && !TECHNICAL.has(check.id));

function printGroup(title, checks) {
  console.log(`\n${title} (${checks.length})`);
  if (!checks.length) {
    console.log('  – ingen');
    return;
  }
  for (const check of checks) {
    console.log(`  - ${check.id}: ${check.status}`);
    const text = check.note || check.evidence;
    if (text) console.log(`    ${String(text).replace(/\s+/g, ' ').trim()}`);
  }
}

console.log(`Fakturasjekk launch status v${gate.version}`);
console.log(`Required gates: ${required.length}`);
console.log(`Complete: ${complete.length}`);
console.log(`Remaining: ${incomplete.length}`);
console.log(`Launch mode: ${gate.launch_mode}`);

printGroup('Kan bygges/testes videre uten ny leverandørkonto', technical);
printGroup('Avhenger av ekstern konto, virksomhetsinfo, avtale eller sign-off', external);

if (unclassified.length) {
  printGroup('UKLASSIFISERTE BLOKKERE – må klassifiseres', unclassified);
  process.exitCode = 2;
}

if (!incomplete.length) {
  console.log('\nREADY: alle obligatoriske launch-gates er complete.');
} else {
  console.log('\nBLOCKED: produksjonslansering forblir stengt til alle obligatoriske gates er complete.');
}
