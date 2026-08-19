function activeRuleMap(registry) {
  return new Map((registry?.rules ?? []).filter(r => r.status === 'active').map(r => [r.id, r]));
}

function groupReferences(ruleIds = [], registry) {
  const rules = activeRuleMap(registry);
  const grouped = new Map();
  for (const id of ruleIds) {
    const rule = rules.get(id);
    if (!rule) continue;
    const key = rule.law;
    if (!grouped.has(key)) grouped.set(key, []);
    if (!grouped.get(key).includes(rule.section)) grouped.get(key).push(rule.section);
  }
  return [...grouped.entries()].map(([law, sections]) => `${law} ${sections.join(' og ')}`);
}

function findingCanBeDrafted(finding, registry) {
  if (['NO_DOCUMENTED_DEVIATION', 'B2B_NOT_SUPPORTED'].includes(finding.code)) return false;
  const ids = finding.rule_ids ?? [];
  if (!ids.length) return true;
  const active = activeRuleMap(registry);
  return ids.every(id => active.has(id));
}

function requestForFinding(finding) {
  switch (finding.code) {
    case 'LINE_SUM_MISMATCH':
      return 'Jeg ber om en spesifisert oppstilling som viser hvordan fakturatotalen er beregnet, og om korrigert faktura dersom summeringen er feil.';
    case 'EXACT_DUPLICATE_LINES':
      return 'Jeg ber om en forklaring på hvorfor de identiske linjene er ført flere ganger, og om korrigering dersom dette er en dobbeltføring.';
    case 'ESTIMATE_ABOVE_15_CONTROL':
      return 'Jeg ber om en spesifisert redegjørelse for hvilke tilleggsarbeider eller andre forhold som forklarer prisøkningen, og dokumentasjon på grunnlaget for eventuelle pristillegg.';
    case 'HANDCRAFT_PRICE_INCREASE_NO_NOTICE':
      return 'Jeg ber om dokumentasjon på når prisøkningen ble kjent, når jeg ble kontaktet om den, og hvilket prisgrunnlag som gjaldt før arbeidet fortsatte.';
    case 'ADDITIONAL_WORK_NO_DOCUMENTED_AUTHORIZATION':
    case 'ADDITIONAL_WORK_AUTHORIZATION_UNCLEAR':
      return 'Jeg ber om dokumentasjon på når og hvordan tilleggsarbeidet ble avklart, eksempelvis arbeidsordre, SMS, e-post eller annet avtalegrunnlag.';
    case 'ADDITIONAL_WORK_PRICE_BASIS_MISSING':
      return 'Jeg ber om spesifikasjon av prisgrunnlaget for tilleggsarbeidet, herunder arbeid, materialer og eventuelle tillegg.';
    case 'PRELIMINARY_FEE_NOT_DISCLOSED':
    case 'PRELIMINARY_FEE_DISCLOSURE_UNCLEAR':
      return 'Jeg ber om dokumentasjon på hvor og når det ble opplyst at diagnose/forundersøkelse ville medføre betalingsplikt.';
    case 'HANDCRAFT_INVOICE_FEE':
      return 'Jeg ber om at gebyret forklares særskilt og fjernes dersom det ikke kan kreves etter reglene som gjelder for tjenesten.';
    case 'GOODS_INVOICE_FEE':
      return 'Jeg ber om dokumentasjon på hvor i avtalen fakturagebyret klart er avtalt. Hvis dette ikke kan dokumenteres, ber jeg om at gebyret fjernes.';
    case 'ADDITIONAL_PAYMENT_CONTRADICTS_AGREEMENT':
    case 'ADDITIONAL_PAYMENT_AGREEMENT_NOT_FOUND':
      return 'Jeg ber om dokumentasjon på avtalegrunnlaget og mitt uttrykkelige samtykke til den separate tilleggsbetalingen. Dersom dette ikke kan dokumenteres, ber jeg om at posten vurderes på nytt.';
    case 'SERVICE_QUOTE_PRICE_INCREASE':
      return 'Jeg ber om dokumentasjon på når og hvordan prisøkningen ble varslet, hva økningen gjelder, og hvordan beløpet er beregnet.';
    case 'SERVICE_INVOICE_NOT_ITEMIZED':
      return 'Jeg ber om en spesifisert regning som gjør det mulig å kontrollere hvilke varer og tjenester som er levert og hvilke priser som er beregnet.';
    case 'SELLER_IDENTITY_FORMAL_MISMATCH':
      return 'Jeg ber om at opplysningene om fakturautsteder kontrolleres og at fakturaen korrigeres dersom navn, organisasjonsnummer eller MVA-angivelse er feil.';
    case 'FORMAL_INVOICE_FIELDS':
      return 'Jeg ber om at de manglende eller uklare fakturaopplysningene rettes eller presiseres. Dette er et eget kontrollpunkt og innebærer ikke i seg selv at hovedkravet bortfaller.';
    default:
      return 'Jeg ber om en skriftlig forklaring og dokumentasjon på dette punktet, og om korrigering dersom fakturaen ikke er riktig.';
  }
}

export function buildDraft({ analysis, registry, invoice_reference = '', user_note = '', mode = 'request' }) {
  if (!analysis?.supported || analysis.status === 'unsupported') {
    return { allowed: false, reason: 'Saken er ikke støttet av aktiv regelmotor.' };
  }

  if (analysis.status === 'clean' || analysis.findings?.every(f => f.code === 'NO_DOCUMENTED_DEVIATION')) {
    return { allowed: false, reason: 'Ingen dokumenterte avvik er funnet. Innsigelse genereres ikke automatisk.' };
  }

  const actionable = (analysis.findings ?? []).filter(f => findingCanBeDrafted(f, registry));
  if (!actionable.length) return { allowed: false, reason: 'Ingen punkter med aktivt og kontrollert grunnlag å ta med i utkast.' };

  const ref = invoice_reference ? ` ${invoice_reference}` : '';
  const lines = [
    'Hei,',
    '',
    `Jeg viser til faktura${ref}. Jeg har gått gjennom fakturaen og grunnlaget jeg har tilgjengelig, og det er noen punkter jeg ønsker avklart før jeg tar endelig stilling til hele beløpet.`,
    '',
    'Dette gjelder:'
  ];

  actionable.forEach((finding, index) => {
    const refs = groupReferences(finding.rule_ids ?? [], registry);
    const refText = refs.length ? ` – jf. ${refs.join('; ')}` : '';
    lines.push(
      '',
      `${index + 1}. ${finding.title}${refText}`,
      `Kontrollen viser: ${finding.explanation}`,
      `Det jeg ber om: ${requestForFinding(finding)}`
    );
  });

  if (analysis.questions?.length) {
    lines.push('', 'For å kunne avklare saken ber jeg også om svar på følgende:');
    analysis.questions.forEach(q => lines.push(`- ${q}`));
  }

  if (user_note.trim()) {
    lines.push('', 'Tilleggsopplysning fra meg:', user_note.trim());
  }

  lines.push('');
  if (mode === 'objection') {
    lines.push('Inntil punktene ovenfor er dokumentert og avklart, bestrider jeg de delene av kravet som gjelder disse forholdene. Jeg ber om skriftlig svar og eventuelt korrigert faktura.');
  } else {
    lines.push('Jeg ber om en skriftlig tilbakemelding på punktene ovenfor. Dersom dere mener fakturaen er riktig, ber jeg om at grunnlaget dokumenteres i svaret. Dersom noe er feil, ber jeg om korrigert faktura.');
  }

  lines.push('', 'På forhånd takk for avklaringen.', '', 'Vennlig hilsen');

  const text = lines.join('\n');

  if (/\b(?:HTJL|FKJL|MFL|POF|BOF|INK)_[A-Z0-9_]+\b/.test(text)) {
    throw new Error('Internal rule id leaked into customer draft');
  }

  return {
    allowed: true,
    mode,
    text,
    references: [...new Set(actionable.flatMap(f => groupReferences(f.rule_ids ?? [], registry)))]
  };
}
