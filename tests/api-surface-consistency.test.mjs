import fs from 'node:fs';
import assert from 'node:assert/strict';
import { ROUTES } from '../server/routes-manifest.mjs';

const openapi = fs.readFileSync(new URL('../server/openapi.yaml', import.meta.url), 'utf8');
const caseHandlers = fs.readFileSync(new URL('../server/case-handlers.mjs', import.meta.url), 'utf8');

for (const route of ROUTES) {
  const openapiPath = route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
  assert.ok(openapi.includes(`  ${openapiPath}:`), `OpenAPI mangler rute fra manifest: ${route.method} ${route.path}`);
}

assert.equal(caseHandlers.includes('structured_response'), false, 'Legacy structured supplier-response handler must not exist in generic case handlers');
assert.ok(openapi.includes('/v1/cases/{case_id}/facts/confirm:'), 'Fact confirmation must be documented in OpenAPI');
assert.equal(openapi.includes('/payment/confirm:'), false, 'Browser payment confirmation route must never be documented');

console.log(`OK API surface consistency: ${ROUTES.length} manifest-ruter finnes i OpenAPI.`);
