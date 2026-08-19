import fs from 'node:fs';
import assert from 'node:assert/strict';

const runbook = fs.readFileSync(new URL('../docs/NEXT-TO-LIVE.md', import.meta.url), 'utf8');

for (const marker of [
  'Fase 1 – eierens eksterne forutsetninger',
  'Fase 2 – arbeid som kan fullføres straks Fase 1-verdiene finnes',
  'Fase 3 – juridisk/personvern før ekte dokumenter',
  'Fase 4 – tekniske sluttprøver',
  'Fase 5 – ekstern tester',
  'Fase 6 – åpne første ekte kunde',
  'Ingen launch dersom én obligatorisk gate er rød',
  'CAPTURED-only unlock',
  'GitHub Pages-demo kan deles allerede, men bruker kun syntetiske saker'
]) {
  assert.ok(runbook.includes(marker), `live runbook missing safety marker: ${marker}`);
}

for (const forbidden of [
  'VIPPS_CLIENT_SECRET=',
  'VIPPS_SUBSCRIPTION_KEY=',
  'VIPPS_WEBHOOK_SECRET=',
  'SUPABASE_SECRET_KEY=',
  'DATABASE_URL=postgresql://',
  'GOOGLE_SERVICE_ACCOUNT_JSON={'
]) {
  assert.equal(runbook.includes(forbidden), false, `live runbook must not contain credential material: ${forbidden}`);
}

assert.match(runbook, /Supabase Pro: oppgrader rett før betalt produksjon/);
assert.match(runbook, /Cloudflare Pages Free: ingen betaling planlagt/);
assert.match(runbook, /Google Cloud: aktiver billing, men betal bare etter faktisk bruk/);

console.log('OK live runbook preserves fail-closed launch order and contains no credentials');
