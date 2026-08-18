function groupReferences(ruleIds = [], registry) {
  const rules = new Map((registry?.rules ?? []).map(r => [r.id, r]));
  const grouped = new Map();
  for (const id of ruleIds) {
    const rule = rules.get(id);
    if (!rule || rule.status !== 'active') continue;
    const key = rule.law;
    if (!grouped.has(key)) grouped.set(key, []);
    if (!grouped.get(key).includes(rule.section)) grouped.get(key).push(rule.section);
  }
  return [...grouped.entries()].map(([law, sections]) => `${law} ${sections.join(' og ')}`);
}

export function buildDraft({ analysis, registry, invoice_reference = '', user_note = '', mode = 'request' }) {
  if (!analysis?.supported || analysis.status === 'unsupported') {
    return { allowed: false, reason: 'Saken er ikke støttet av aktiv regelmotor.' };
  }

  if (analysis.status === 'clean' || analysis.findings?.every(f => f.code === 'NO_DOCUMENTED_DEVIATION')) {
    return { allowed: false, reason: 'Ingen dokumenterte avvik er funnet. Innsigelse genereres ikke automatisk.' };
  }

  const actionable = (analysis.findings ?? []).filter(f => !['NO_DOCUMENTED_DEVIATION', 'B2B_NOT_SUPPORTED'].includes(f.code));
  if (!actionable.length) return { allowed: false, reason: 'Ingen punkter å ta med i utkast.' };

  const ref = invoice_reference ? ` ${invoice_reference}` : '';
  const lines = [
    'Hei,',
    '',
    `Jeg viser til faktura${ref}. Jeg ber om skriftlig avklaring av følgende punkter:`
  ];

  actionable.forEach((finding, index) => {
    const refs = groupReferences(finding.rule_ids ?? [], registry);
    const refText = refs.length ? ` (${refs.map(r => `jf. ${r}`).join('; ')})` : '';
    lines.push('', `${index + 1}. ${finding.title}${refText}`, finding.explanation);
  });

  if (analysis.questions?.length) {
    lines.push('', 'For å kunne avklare saken ber jeg særlig om svar på:');
    analysis.questions.forEach(q => lines.push(`- ${q}`));
  }

  if (user_note.trim()) {
    lines.push('', 'Tilleggsopplysning fra meg:', user_note.trim());
  }

  lines.push('');
  if (mode === 'objection') {
    lines.push('Jeg bestrider de delene av kravet som gjelder punktene ovenfor inntil de er dokumentert og avklart. Jeg ber om skriftlig svar og eventuelt korrigert faktura.');
  } else {
    lines.push('Jeg ber om skriftlig svar på punktene ovenfor og eventuelt korrigert faktura dersom kontrollen viser feil.');
  }
  lines.push('', 'Vennlig hilsen');

  const text = lines.join('\n');

  if (/\b(?:HTJL|FKJL|POF|BOF)_[A-Z0-9_]+\b/.test(text)) {
    throw new Error('Internal rule id leaked into customer draft');
  }

  return {
    allowed: true,
    mode,
    text,
    references: [...new Set(actionable.flatMap(f => groupReferences(f.rule_ids ?? [], registry)))]
  };
}
