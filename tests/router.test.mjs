import assert from 'node:assert/strict';
import { matchRoute } from '../server/router.mjs';

const a = matchRoute('GET', '/v1/cases');
assert.equal(a.route.action, 'list_cases');
const b = matchRoute('POST', '/v1/cases/case-123/analyze');
assert.equal(b.route.action, 'analyze_case');
assert.equal(b.params.case_id, 'case-123');
const c = matchRoute('DELETE', '/v1/cases/case%20x');
assert.equal(c.route.action, 'delete_case');
assert.equal(c.params.case_id, 'case x');
assert.equal(matchRoute('PATCH', '/v1/cases/case-1'), null);
assert.equal(matchRoute('GET', '/v1/nope'), null);

console.log('OK router');
