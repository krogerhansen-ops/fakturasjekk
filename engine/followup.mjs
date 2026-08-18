function normalize(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function publicRuleReference(ruleId, registry) {
  const rule = (registry?.rules ?? []).find(r => r.id === ruleId && r.status === 'active');
  return rule ? `${rule.law} ${rule.section}` : null;
}

export function reviewSupplierResponse({ original_analysis, response = {}, registry } = {}) {
  if (!original_analysis?.findings?.length) {
    return {
      allowed: false,
      status: 'no_original_findings',
      reason: 'Det finnes ingen opprinnelige funn å kontrollere svaret mot.',
      items: [],
      unanswered_count: 0,
      partially_answered_count: 0,
      answered_count: 0
    };
  }

  const responseItems = Array.isArray(response.items) ? response.items : [];
  const byCode = new Map(responseItems.map(item => [item.finding_code, item]));
  const items = [];

  for (const finding of original_analysis.findings) {
    if (['NO_DOCUMENTED_DEVIATION', 'B2B_NOT_SUPPORTED'].includes(finding.code)) continue;

    const answer = byCode.get(finding.code);
    let status = 'unanswered';
    let explanation = 'Leverandørsvaret inneholder ikke et identifisert svar på dette punktet.';

    if (answer) {
      const coverage = answer.coverage ?? 'unknown';
      const text = normalize(answer.answer_text);
      const hasSubstance = text.length >= 15;
      const hasRequestedDocumentation = answer.documentation_provided === true;

      if (coverage === 'answered' && hasSubstance && (!answer.documentation_required || hasRequestedDocumentation)) {
        status = 'answered';
        explanation = 'Punktet fremstår besvart i det strukturerte svargrunnlaget.';
      } else if (coverage === 'partial' || hasSubstance) {
        status = 'partial';
        explanation = answer.documentation_required && !hasRequestedDocumentation
          ? 'Punktet er omtalt, men etterspurt dokumentasjon er ikke registrert som levert.'
          : 'Punktet er omtalt, men ikke fullt avklart.';
      }
    }

    const refs = [...new Set((finding.rule_ids ?? []).map(id => publicRuleReference(id, registry)).filter(Boolean))];
    items.push({
      finding_code: finding.code,
      title: finding.title,
      status,
      explanation,
      active_rule_references: refs,
      answer_text: answer?.answer_text ?? '',
      documentation_provided: answer?.documentation_provided === true
    });
  }

  const unanswered = items.filter(i => i.status === 'unanswered').length;
  const partial = items.filter(i => i.status === 'partial').length;
  const answered = items.filter(i => i.status === 'answered').length;

  return {
    allowed: true,
    status: unanswered || partial ? 'follow_up_recommended' : 'all_points_answered',
    items,
    unanswered_count: unanswered,
    partially_answered_count: partial,
    answered_count: answered
  };
}

export function buildFollowUpDraft({ review, invoice_reference = '', user_note = '' } = {}) {
  if (!review?.allowed) return { allowed: false, reason: review?.reason ?? 'Svarreview er ikke tilgjengelig.' };
  const open = review.items.filter(item => item.status !== 'answered');
  if (!open.length) return { allowed: false, reason: 'Alle registrerte punkter fremstår besvart. Nytt oppfølgingsbrev genereres ikke automatisk.' };

  const lines = [
    'Hei,',
    '',
    `Takk for svaret${invoice_reference ? ` vedrørende faktura ${invoice_reference}` : ''}. Jeg oppfatter at følgende punkt fortsatt ikke er fullt avklart:`
  ];

  open.forEach((item, index) => {
    const refs = item.active_rule_references.length ? ` (jf. ${item.active_rule_references.join('; ')})` : '';
    lines.push('', `${index + 1}. ${item.title}${refs}`, item.explanation);
  });

  if (user_note.trim()) {
    lines.push('', 'Tilleggsopplysning fra meg:', user_note.trim());
  }

  lines.push('', 'Jeg ber om at punktene ovenfor besvares konkret og at eventuell etterspurt dokumentasjon oversendes. Dersom dette medfører endring i fakturaen, ber jeg om korrigert faktura.', '', 'Vennlig hilsen');

  const text = lines.join('\n');
  if (/\b(?:HTJL|FKJL|POF|BOF|INK)_[A-Z0-9_]+\b/.test(text)) throw new Error('Internal rule id leaked into follow-up draft');

  return { allowed: true, text, open_items: open.length };
}
