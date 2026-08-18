export function assessAssurance({ analysis, evidence = [] } = {}) {
  const counts = { documented: 0, user_provided: 0, calculated: 0, needs_clarification: 0 };
  for (const item of evidence) if (item?.type in counts) counts[item.type] += 1;

  if (analysis?.status === 'stopped') {
    return { level: 'stopped', counts, message: 'Saken er stoppet før ordinær vurdering.' };
  }
  if (counts.needs_clarification > 0 || (analysis?.questions?.length ?? 0) > 0) {
    return { level: 'needs_clarification', counts, message: 'Minst ett viktig forhold må avklares før resultatet kan behandles som komplett.' };
  }
  if (counts.user_provided > 0) {
    return {
      level: 'mixed_evidence',
      counts,
      message: 'Resultatet bygger delvis på opplysninger eller dokumentavlesning bekreftet av deg. Disse opplysningene er ikke behandlet som maskinelt dokumenterte fakta.'
    };
  }
  return {
    level: 'document_supported',
    counts,
    message: 'De faktiske opplysningene som brukes i kontrollen er hentet fra dokumentgrunnlaget eller beregnet fra dokumenterte verdier.'
  };
}
