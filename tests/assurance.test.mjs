import assert from 'node:assert/strict';
import { assessAssurance } from '../engine/assurance.mjs';

const documented = assessAssurance({ analysis: { status: 'attention', questions: [] }, evidence: [{ type: 'documented' }, { type: 'calculated' }] });
assert.equal(documented.level, 'document_supported');

const mixed = assessAssurance({ analysis: { status: 'attention', questions: [] }, evidence: [{ type: 'documented' }, { type: 'user_provided' }, { type: 'calculated' }] });
assert.equal(mixed.level, 'mixed_evidence');
assert.match(mixed.message, /bekreftet av deg/i);

const unclear = assessAssurance({ analysis: { status: 'attention', questions: ['Hva skjedde?'] }, evidence: [{ type: 'documented' }] });
assert.equal(unclear.level, 'needs_clarification');

const stopped = assessAssurance({ analysis: { status: 'stopped', questions: [] }, evidence: [] });
assert.equal(stopped.level, 'stopped');

console.log('OK assurance classification');
