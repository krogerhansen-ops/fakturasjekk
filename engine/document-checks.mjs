import { compareDocumentLines } from './document-comparison.mjs';
import { checkInvoiceMath } from './invoice-math.mjs';

export function runDocumentChecks(facts = {}) {
  const math = Array.isArray(facts.invoice_lines)
    ? checkInvoiceMath({
        lines: facts.invoice_lines,
        stated_subtotal: facts.stated_subtotal,
        stated_vat: facts.stated_vat,
        stated_total: facts.invoice_total
      })
    : null;
  const comparison = Array.isArray(facts.invoice_lines) && Array.isArray(facts.agreement_lines)
    ? compareDocumentLines({ agreement_lines: facts.agreement_lines, invoice_lines: facts.invoice_lines })
    : null;

  const findings = [];
  const questions = [];
  if (math) {
    for (const issue of math.issues) {
      findings.push({
        category: 'arithmetic',
        severity: ['stated_total_mismatch','line_sum_total_mismatch'].includes(issue.type) ? 'high' : 'medium',
        title: issue.type === 'line_amount_mismatch' ? `Regneavvik på linjen «${issue.description}»`
          : issue.type === 'line_vat_mismatch' ? `MVA-regnestykket avviker på linjen «${issue.description}»`
          : issue.type === 'subtotal_mismatch' ? 'Linjesummen samsvarer ikke med oppgitt subtotal'
          : issue.type === 'vat_total_mismatch' ? 'Oppgitt MVA samsvarer ikke med MVA beregnet fra oppgitte linjesatser'
          : issue.type === 'stated_total_mismatch' ? 'Subtotal + oppgitt MVA samsvarer ikke med fakturatotalen'
          : 'Linjesum + oppgitt MVA samsvarer ikke med fakturatotalen',
        explanation: `Beregnet verdi: ${issue.expected}. Oppgitt verdi: ${issue.stated}.`,
        legal_conclusion: false,
        rule_ids: []
      });
    }
  }
  if (comparison) {
    for (const line of comparison.added_on_invoice) {
      findings.push({ category: 'document_difference', severity: 'medium', title: `Fakturalinje finnes ikke i tilbudet: «${line.description}»`, explanation: 'Fakturasjekk fant ingen sikker linjematch i tilbud/avtale. Dette er et dokumentavvik som bør forklares; det er ikke alene en juridisk konklusjon.', legal_conclusion: false, rule_ids: [] });
    }
    for (const changed of comparison.changed) {
      findings.push({ category: 'document_difference', severity: 'medium', title: `Beløp eller mengde er endret: «${changed.invoice.description}»`, explanation: `Sammenligningen viser en endring mellom tilbud/avtale og faktura${changed.amount_difference != null ? ` på ${changed.amount_difference} kr` : ''}.`, legal_conclusion: false, rule_ids: [] });
    }
    for (const group of comparison.ambiguous) {
      questions.push(`Linjen «${group.agreement.description}» kan ikke matches sikkert mot én fakturalinje. Kontroller hvilke linjer som hører sammen.`);
    }
  }

  return {
    math,
    comparison,
    findings,
    questions,
    safe_for_automatic_conclusion: (comparison?.safe_for_automatic_conclusion ?? true) && questions.length === 0
  };
}
