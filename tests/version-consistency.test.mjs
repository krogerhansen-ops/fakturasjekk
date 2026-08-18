import fs from 'node:fs';
import assert from 'node:assert/strict';

const product = JSON.parse(fs.readFileSync(new URL('../config/product.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const openapi = fs.readFileSync(new URL('../server/openapi.yaml', import.meta.url), 'utf8');

assert.equal(product.version, pkg.version, 'Product and package versions must match');
assert.match(openapi, new RegExp(`version: ${product.version.replaceAll('.', '\\.')}`), 'OpenAPI version must match product version');
assert.equal(product.price_nok, 29);
assert.equal(product.full_check_free, false);
assert.equal(product.demo_free, true);
assert.equal(product.payment_confirmation_mode, 'provider_webhook_only');
assert.equal(product.customer_internal_code_exposure, false);
assert.equal(openapi.includes('/payment/confirm:'), false, 'OpenAPI must not expose browser payment confirmation route');

console.log(`OK version consistency ${product.version}`);
