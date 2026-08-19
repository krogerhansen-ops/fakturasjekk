const VALID_TYPES = new Set(['documented', 'registry', 'user_provided', 'calculated', 'rule', 'needs_clarification']);

export function evidenceItem({ type, field, value = null, source_id = null, confidence = null, note = '' }) {
  if (!VALID_TYPES.has(type)) throw new Error(`Invalid evidence type: ${type}`);
  if (!field) throw new Error('Evidence field is required');
  if ((type === 'documented' || type === 'registry') && !source_id) throw new Error(`${type} evidence requires source_id for ${field}`);
  return { type, field, value, source_id, confidence, note };
}

export function buildEvidenceLedger({ facts = {}, origins = {}, analysis = null, user_note = '' } = {}) {
  const ledger = [];

  for (const [field, value] of Object.entries(facts)) {
    const origin = origins[field];
    if (origin?.type === 'documented') {
      ledger.push(evidenceItem({
        type: 'documented',
        field,
        value,
        source_id: origin.source_id,
        confidence: origin.confidence ?? 'high',
        note: origin.note ?? ''
      }));
    } else if (origin?.type === 'registry') {
      ledger.push(evidenceItem({
        type: 'registry',
        field,
        value,
        source_id: origin.source_id,
        confidence: origin.confidence ?? 'authoritative_public_registry',
        note: origin.note ?? 'Opplysning fra offentlig register.'
      }));
    } else if (origin?.type === 'user_provided') {
      ledger.push(evidenceItem({
        type: 'user_provided',
        field,
        value,
        source_id: null,
        confidence: origin.confidence ?? null,
        note: origin.note ?? 'Opplyst av brukeren.'
      }));
    } else if (origin?.type === 'calculated') {
      ledger.push(evidenceItem({
        type: 'calculated',
        field,
        value,
        source_id: null,
        confidence: origin.confidence ?? 'deterministic',
        note: origin.note ?? 'Beregnet av Fakturasjekk fra registrerte kilder.'
      }));
    } else {
      ledger.push(evidenceItem({
        type: 'needs_clarification',
        field,
        value,
        note: 'Faktum mangler dokumentert, offentlig register- eller eksplisitt brukeroppgitt kilde.'
      }));
    }
  }

  if (analysis?.calculations) {
    for (const [field, value] of Object.entries(analysis.calculations)) {
      ledger.push(evidenceItem({
        type: 'calculated',
        field,
        value,
        source_id: null,
        note: 'Beregnet av Fakturasjekk fra sakens registrerte fakta.'
      }));
    }
  }

  if (analysis?.rule_ids?.length) {
    for (const ruleId of [...new Set(analysis.rule_ids)]) {
      ledger.push(evidenceItem({
        type: 'rule',
        field: 'rule_reference',
        value: ruleId,
        source_id: ruleId,
        note: 'Regel-ID brukes internt og skal oversettes til lov/paragraf før kundepresentasjon.'
      }));
    }
  }

  for (const question of analysis?.questions ?? []) {
    ledger.push(evidenceItem({
      type: 'needs_clarification',
      field: 'open_question',
      value: question,
      note: 'Må avklares før et skråsikkert resultat kan gis.'
    }));
  }

  if (user_note.trim()) {
    ledger.push(evidenceItem({
      type: 'user_provided',
      field: 'user_note',
      value: user_note.trim(),
      note: 'Fritekst fra brukeren. Skal aldri automatisk behandles som dokumentert faktum.'
    }));
  }

  return ledger;
}

export function summarizeEvidence(ledger = []) {
  return ledger.reduce((summary, item) => {
    summary[item.type] = (summary[item.type] ?? 0) + 1;
    return summary;
  }, {});
}

export function assertEvidenceSafety(ledger = []) {
  const badDocumented = ledger.filter(item => item.type === 'documented' && !item.source_id);
  if (badDocumented.length) throw new Error('Documented evidence without source_id');
  const badRegistry = ledger.filter(item => item.type === 'registry' && !item.source_id);
  if (badRegistry.length) throw new Error('Registry evidence without source_id');

  const userNoteAsDocument = ledger.find(item => item.field === 'user_note' && ['documented', 'registry'].includes(item.type));
  if (userNoteAsDocument) throw new Error('User note was incorrectly promoted to sourced evidence');

  return true;
}
