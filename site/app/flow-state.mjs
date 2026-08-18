export const UI_STEPS = Object.freeze([
  { id: 'documents', label: 'Dokumenter' },
  { id: 'facts', label: 'Kontroll av fakta' },
  { id: 'preview', label: 'Forhåndsvisning' },
  { id: 'payment', label: 'Betaling' },
  { id: 'result', label: 'Resultat' },
  { id: 'followup', label: 'Oppfølging' }
]);

export function deriveUiState({ caseData = null, analysisResponse = null, resultLoaded = false } = {}) {
  if (!caseData) return { view: 'start', step: 'documents', step_index: 0 };
  if (analysisResponse?.status === 'needs_confirmation') return { view: 'confirm_facts', step: 'facts', step_index: 1 };
  const state = caseData.state;
  if (state === 'draft') {
    const waiting = (caseData.documents ?? []).some(d => d.status === 'awaiting_upload');
    return { view: waiting ? 'uploading' : 'documents', step: 'documents', step_index: 0 };
  }
  if (state === 'documents_ready') return { view: 'analyzing', step: 'facts', step_index: 1 };
  if (state === 'analysis_ready') return { view: 'preview', step: 'preview', step_index: 2 };
  if (state === 'paid') return { view: resultLoaded ? 'result' : 'load_result', step: 'result', step_index: 4 };
  if (['draft_ready', 'sent_to_supplier'].includes(state)) return { view: 'result', step: 'result', step_index: 4 };
  if (['supplier_response_received', 'follow_up_ready'].includes(state)) return { view: 'followup', step: 'followup', step_index: 5 };
  if (state === 'resolved') return { view: 'resolved', step: 'followup', step_index: 5 };
  if (['closed', 'deleted'].includes(state)) return { view: 'closed', step: null, step_index: -1 };
  return { view: 'unknown', step: null, step_index: -1 };
}

export function previewToPaymentState({ analysisResponse, paymentSession = null } = {}) {
  if (analysisResponse?.status !== 'analysis_ready') return { view: 'preview_unavailable', step: 'preview', step_index: 2 };
  if (!paymentSession) return { view: 'preview', step: 'preview', step_index: 2 };
  return { view: 'payment_redirect', step: 'payment', step_index: 3, checkout_url: paymentSession.checkout_url };
}

export function stepStatus(stepIndex, currentIndex) {
  if (currentIndex < 0) return 'inactive';
  if (stepIndex < currentIndex) return 'completed';
  if (stepIndex === currentIndex) return 'current';
  return 'upcoming';
}

// This module is UX-only. Backend ownership, payment and upload verification remain authoritative.
export const SERVER_IS_AUTHORITY = true;
