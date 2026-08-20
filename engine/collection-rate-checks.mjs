import { delayInterestRateOn, inkassoFeeCapsOn } from './collection-rates.mjs';

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function feeClaimForStage(input) {
  const stage = input.stage ?? 'none';
  if (stage === 'reminder') {
    return { kind: 'reminder', amount: finiteNumber(input.reminder_fee ?? input.notice_fee), capField: 'reminder_fee_nok', label: 'purregebyr' };
  }
  if (stage === 'collection_notice') {
    return { kind: 'collection_notice', amount: finiteNumber(input.collection_notice_fee ?? input.notice_fee), capField: 'collection_notice_fee_nok', label: 'gebyr for inkassovarsel' };
  }
  if (stage === 'payment_request') {
    return { kind: 'own_payment_request', amount: finiteNumber(input.payment_request_fee ?? input.notice_fee), capField: 'own_payment_request_fee_nok', label: 'gebyr for betalingsoppfordring ved egeninkasso' };
  }
  return null;
}

export function evaluateCollectionRateClaims(input = {}) {
  const result = {
    status: 'not_checked',
    checks: [],
    findings: [],
    questions: []
  };

  const fee = feeClaimForStage(input);
  if (fee?.amount !== null) {
    result.status = 'checked';
    const sentDate = input.notice_sent_date ?? input.sent_date ?? null;
    const caps = inkassoFeeCapsOn(sentDate);
    const check = {
      id: 'INKASSO_FEE_DATE_VERSION',
      type: 'collection_fee',
      fee_kind: fee.kind,
      stated_amount_nok: fee.amount,
      event_date: sentDate,
      rate_status: caps.status,
      max_amount_nok: caps.status === 'verified' ? caps[fee.capField] : null,
      legal_basis: caps.status === 'verified' ? caps.legal_basis : 'inkassoforskriften § 1-2',
      source_url: caps.status === 'verified' ? caps.source_url : null
    };
    result.checks.push(check);

    if (caps.status !== 'verified') {
      result.questions.push(sentDate
        ? `Gebyrsatsen for ${sentDate} er ikke aktivert i Fakturasjekks versjonerte satstabell. Gebyret vurderes derfor ikke automatisk.`
        : 'Hvilken dato ble purringen, inkassovarselet eller betalingsoppfordringen sendt? Gebyrgrensen bestemmes av satsen på utsendelsesdatoen.');
    } else if (fee.amount > caps[fee.capField]) {
      result.findings.push({
        code: 'COLLECTION_NOTICE_FEE_ABOVE_DATE_CAP',
        severity: 'high',
        title: `${fee.label[0].toUpperCase()}${fee.label.slice(1)} er høyere enn satsen for utsendelsesdatoen`,
        explanation: `Dokumentet viser ${fee.amount} kr. Maksimal gebyrmessig erstatning for denne typen varsel på ${sentDate} er ${caps[fee.capField]} kr etter inkassoforskriften § 1-2.`,
        rule_ids: ['INK_17_COLLECTION_COSTS'],
        legal_basis: caps.legal_basis,
        source_url: caps.source_url,
        event_date: sentDate,
        stated_amount_nok: fee.amount,
        max_amount_nok: caps[fee.capField]
      });
    }
  }

  const statedInterest = finiteNumber(input.stated_delay_interest_rate_percent);
  if (statedInterest !== null) {
    result.status = 'checked';
    const rateDate = input.interest_rate_date ?? input.interest_effective_date ?? null;
    const rate = delayInterestRateOn(rateDate);
    const basis = input.interest_basis ?? null;
    result.checks.push({
      id: 'DELAY_INTEREST_DATE_VERSION',
      type: 'delay_interest_rate',
      stated_rate_percent: statedInterest,
      rate_date: rateDate,
      rate_status: rate.status,
      statutory_rate_percent: rate.status === 'verified' ? rate.annual_rate_percent : null,
      interest_basis: basis,
      legal_basis: rate.status === 'verified' ? rate.legal_basis : 'forsinkelsesrenteloven §§ 3–4',
      source_url: rate.status === 'verified' ? rate.source_url : null
    });

    if (rate.status !== 'verified') {
      result.questions.push(rateDate
        ? `Forsinkelsesrentesatsen for ${rateDate} er ikke aktivert i Fakturasjekks versjonerte satstabell. Renten vurderes derfor ikke automatisk.`
        : 'Hvilken dato gjelder den oppgitte forsinkelsesrentesatsen fra? Satsen endres halvårlig.');
    } else if (basis !== 'statutory_delay_interest') {
      result.questions.push('Er den oppgitte renten uttrykkelig angitt som lovbestemt forsinkelsesrente, eller videreføres en avtalt rente som løp før betalingsplikten inntrådte? Fakturasjekk konkluderer ikke uten dette skillet.');
    } else if (statedInterest > rate.annual_rate_percent + 1e-9) {
      result.findings.push({
        code: 'STATED_DELAY_INTEREST_ABOVE_DATE_RATE',
        severity: 'high',
        title: 'Oppgitt lovbestemt forsinkelsesrente er høyere enn satsen for perioden',
        explanation: `Dokumentet oppgir ${statedInterest.toFixed(2)} % som lovbestemt forsinkelsesrente fra ${rateDate}. Den offentlige satsen for denne datoen er ${rate.annual_rate_percent.toFixed(2)} % p.a.`,
        rule_ids: [],
        legal_basis: `${rate.legal_basis}; forsinkelsesrenteloven § 4 i forbrukerforhold`,
        source_url: rate.source_url,
        rate_date: rateDate,
        stated_rate_percent: statedInterest,
        statutory_rate_percent: rate.annual_rate_percent
      });
    }
  }

  result.questions = [...new Set(result.questions)];
  if (result.findings.some(finding => finding.severity === 'high')) result.status = 'attention';
  else if (result.questions.length) result.status = 'needs_clarification';
  else if (result.checks.length) result.status = 'ok';

  return result;
}
