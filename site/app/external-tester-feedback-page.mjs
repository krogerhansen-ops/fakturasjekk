const form = document.querySelector('#feedback-form');
const output = document.querySelector('#output');
const summary = document.querySelector('#summary');
const copyStatus = document.querySelector('#copy-status');

function addScale(containerId, name) {
  const container = document.querySelector(containerId);
  for (let value = 1; value <= 5; value += 1) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = String(value);
    input.required = true;
    label.append(input, document.createElement('br'), String(value));
    container.append(label);
  }
}

addScale('#clarity-scale', 'clarity');
addScale('#trust-scale', 'trust');
addScale('#ease-scale', 'ease');

function clean(value) {
  return String(value || '').replace(/\r/g, '').trim() || 'Ikke oppgitt';
}

function selected(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
}

function radio(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || 'Ikke oppgitt';
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const tested = selected('tested');
  const lines = [
    'FAKTURASJEKK – EKSTERN TESTOPPSUMMERING',
    `Dato: ${new Date().toISOString().slice(0, 10)}`,
    `Enhet: ${clean(document.querySelector('#device').value)}`,
    `Nettleser: ${clean(document.querySelector('#browser').value)}`,
    `Testet: ${tested.length ? tested.join(', ') : 'Ikke oppgitt'}`,
    '',
    `Forståelig resultat (1–5): ${radio('clarity')}`,
    `Troverdig regel-/paragrafkontroll (1–5): ${radio('trust')}`,
    `Brukervennlighet (1–5): ${radio('ease')}`,
    `29 kr rimelig: ${clean(document.querySelector('#pay').value)}`,
    '',
    'UKLART / VANSKELIG:', clean(document.querySelector('#confusing').value),
    '', 'FEIL / NOE SOM IKKE VIRKET:', clean(document.querySelector('#bug').value),
    '', 'SAVNET:', clean(document.querySelector('#missing').value),
    '', 'MEST NYTTIG:', clean(document.querySelector('#best').value),
    '', 'Personopplysninger/ekte fakturadata skal ikke være inkludert i denne oppsummeringen.'
  ];
  summary.value = lines.join('\n');
  output.classList.add('visible');
  copyStatus.textContent = '';
  output.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.querySelector('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(summary.value);
    copyStatus.textContent = 'Kopiert. Lim teksten inn i meldingen til testansvarlig.';
  } catch {
    summary.focus();
    summary.select();
    copyStatus.textContent = 'Automatisk kopiering var ikke tilgjengelig. Teksten er markert – velg Kopier.';
  }
});

document.querySelector('#reset').addEventListener('click', () => {
  form.reset();
  summary.value = '';
  output.classList.remove('visible');
  copyStatus.textContent = '';
});
