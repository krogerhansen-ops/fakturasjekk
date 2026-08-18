import assert from 'node:assert/strict';
import { deriveUiState, previewToPaymentState, stepStatus, SERVER_IS_AUTHORITY } from '../site/app/flow-state.mjs';

assert.equal(SERVER_IS_AUTHORITY, true);
assert.equal(deriveUiState({}).view, 'start');
assert.equal(deriveUiState({ caseData: { state: 'draft', documents: [{ status: 'awaiting_upload' }] } }).view, 'uploading');
assert.equal(deriveUiState({ caseData: { state: 'analysis_ready', documents: [] } }).view, 'preview');
assert.equal(deriveUiState({ caseData: { state: 'analysis_ready' }, analysisResponse: { status: 'needs_confirmation' } }).view, 'confirm_facts');
assert.equal(deriveUiState({ caseData: { state: 'paid' }, resultLoaded: false }).view, 'load_result');
assert.equal(deriveUiState({ caseData: { state: 'paid' }, resultLoaded: true }).view, 'result');
assert.equal(deriveUiState({ caseData: { state: 'follow_up_ready' } }).view, 'followup');
assert.equal(deriveUiState({ caseData: { state: 'deleted' } }).view, 'closed');

const noPay = previewToPaymentState({ analysisResponse: { status: 'needs_confirmation' } });
assert.equal(noPay.view, 'preview_unavailable');
const pay = previewToPaymentState({ analysisResponse: { status: 'analysis_ready' }, paymentSession: { checkout_url: 'https://pay.example' } });
assert.equal(pay.view, 'payment_redirect');
assert.equal(pay.checkout_url, 'https://pay.example');
assert.equal(stepStatus(0, 2), 'completed');
assert.equal(stepStatus(2, 2), 'current');
assert.equal(stepStatus(3, 2), 'upcoming');

console.log('OK browser flow state');
