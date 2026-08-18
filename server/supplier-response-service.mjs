export function createSupplierResponseService({ caseStore, services, interpreter, clock = () => new Date() } = {}) {
  if (!caseStore?.getOwned) throw new Error('Case store requires getOwned.');
  if (!services?.registerSupplierResponse) throw new Error('Backend services require registerSupplierResponse.');
  if (!interpreter?.interpret) throw new Error('Supplier response interpreter is not configured.');

  async function processText({ case_id, owner_id, response_text, invoice_reference = '' }) {
    if (typeof response_text !== 'string' || !response_text.trim()) throw new Error('Supplier response text is required.');
    const caseData = await caseStore.getOwned(case_id, owner_id);
    const original = caseData.analyses?.at(-1)?.result?.analysis;
    if (!original?.findings?.length) throw new Error('Original analysis with findings is required before supplier response review.');

    const originalFindings = original.findings.filter(f => !['NO_DOCUMENTED_DEVIATION', 'B2B_NOT_SUPPORTED'].includes(f.code));
    if (!originalFindings.length) throw new Error('No actionable original findings exist for supplier response review.');

    const structured = await interpreter.interpret({
      original_findings: originalFindings.map(f => ({ code: f.code, title: f.title, explanation: f.explanation })),
      response_text: response_text.trim()
    });

    return services.registerSupplierResponse({
      case_id,
      owner_id,
      response_record: {
        invoice_reference: String(invoice_reference ?? '').slice(0, 200),
        text: response_text.trim().slice(0, 20000),
        received_at: clock().toISOString()
      },
      structured_response: structured
    });
  }

  return { processText };
}
