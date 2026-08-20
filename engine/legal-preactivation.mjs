function isoDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  const ms = Date.parse(`${match[1]}T00:00:00Z`);
  return Number.isFinite(ms) ? match[1] : null;
}

function daysBetween(from, to) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86400000);
}

export function evaluateLegalPreactivation(facts = {}) {
  const result = {
    checks: [],
    questions: []
  };

  if (facts.case_type !== 'handcraft_service') return result;

  const requested = facts.itemized_invoice_requested === true || Boolean(isoDate(facts.itemized_invoice_request_date));
  if (!requested) return result;

  const requestDate = isoDate(facts.itemized_invoice_request_date);
  const dueDate = isoDate(facts.due_date);
  const receivedDate = isoDate(facts.itemized_invoice_received_date);

  const check = {
    id: 'HTJL_37_ITEMIZED_INVOICE_TIMELINE',
    law: 'håndverkertjenesteloven',
    section: '§ 37',
    status: 'needs_timeline',
    legal_conclusion: false,
    request_date: requestDate,
    due_date: dueDate,
    received_date: receivedDate,
    request_days_before_due: null,
    note: '§ 37 bruker vilkåret «tilstrekkelig tid før forfall». Fakturasjekk bruker derfor ingen egen automatisk daggrense.'
  };

  if (!requestDate) {
    result.questions.push('Når ba du om en spesifisert regning? Last gjerne opp SMS, e-post eller annen dokumentasjon som viser datoen.');
  }
  if (!dueDate) {
    result.questions.push('Hva var forfallsdatoen på fakturaen da du ba om spesifisert regning?');
  }
  if (!receivedDate) {
    result.questions.push('Har du mottatt en spesifisert regning etter forespørselen? Hvis ja, hvilken dato mottok du den?');
  }

  if (requestDate && dueDate) {
    check.request_days_before_due = daysBetween(requestDate, dueDate);
    check.status = receivedDate ? 'timeline_documented' : 'request_and_due_documented';

    if (check.request_days_before_due < 0) {
      result.questions.push('Dokumentasjonen viser at forespørselen om spesifisert regning kom etter oppgitt forfall. Kontroller datoene før § 37 vurderes.');
    } else {
      result.questions.push(`Forespørselen er dokumentert ${check.request_days_before_due} dag(er) før oppgitt forfall. Om dette er «tilstrekkelig tid» etter § 37 må vurderes konkret; Fakturasjekk setter ingen egen automatisk terskel.`);
    }
  }

  result.checks.push(check);
  result.questions = [...new Set(result.questions)];
  return result;
}
