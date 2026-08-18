export * from '../../engine/draft.mjs';

function installLetterPresentation() {
  if (typeof document === 'undefined' || document.getElementById('fakturasjekk-letter-ui')) return;

  const style = document.createElement('style');
  style.id = 'fakturasjekk-letter-ui';
  style.textContent = `
    .draftbox{padding:0!important;overflow:hidden;background:#f5f7f9!important;border:1px solid #dbe3ea!important;box-shadow:0 12px 34px rgba(16,42,67,.06)!important}
    .draftbox>div:first-child{padding:18px 22px;margin:0!important;background:#fff;border-bottom:1px solid #dbe3ea}
    .letter-status{display:inline-flex;align-items:center;gap:7px;padding:6px 9px;border-radius:999px;background:#edf7f2;color:#087f5b;font-size:11px;font-weight:900;margin-bottom:12px}
    .letter-meta{background:#fff;border-bottom:1px solid #dbe3ea;padding:14px 22px;display:grid;gap:8px}
    .letter-meta-row{display:grid;grid-template-columns:56px 1fr;gap:10px;align-items:baseline;font-size:13px}
    .letter-meta-label{color:#66788a;font-weight:800}
    .letter-meta-value{color:#102a43;font-weight:650;min-width:0}
    .draft{margin:24px auto 28px!important;width:min(760px,calc(100% - 32px));max-height:none!important;overflow:visible!important;background:#fff!important;border:1px solid #dbe3ea!important;border-radius:14px!important;padding:34px 38px 38px!important;box-shadow:0 12px 32px rgba(16,42,67,.07)!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;font-size:15px!important;line-height:1.72!important;color:#243746!important;white-space:normal!important}
    .letter-p{margin:0 0 16px}.letter-greeting{margin-bottom:22px}.letter-section{margin:28px 0 8px;color:#102a43;font-size:16px;line-height:1.45}.letter-explainer{margin:8px 0 11px;padding:12px 14px;background:#f7f9fb;border-radius:10px;color:#425466}.letter-request{margin:8px 0 18px;padding:12px 14px;background:#f2f7fb;border-left:3px solid #0b5cab;border-radius:8px;color:#243746}.letter-label{font-weight:850;color:#102a43}.letter-list{margin:8px 0 18px;padding-left:22px}.letter-list li{margin:7px 0}.letter-signoff{margin-top:26px}.letter-note{margin:8px 0 18px;padding:12px 14px;background:#fff9e8;border-radius:9px;color:#5f4b15}
    @media(max-width:700px){.draftbox>div:first-child,.letter-meta{padding-left:16px;padding-right:16px}.letter-meta-row{grid-template-columns:48px 1fr}.draft{width:calc(100% - 20px);margin:10px auto 18px!important;padding:24px 20px 28px!important;border-radius:11px!important;font-size:14.5px!important;line-height:1.67!important;box-shadow:none!important}.letter-section{font-size:15px}}
  `;
  document.head.appendChild(style);

  const draft = document.getElementById('draft');
  const box = draft?.closest('.draftbox');
  if (!draft || !box) return;

  const header = box.querySelector(':scope > div:first-child');
  if (header && !header.querySelector('.letter-status')) {
    const badge = document.createElement('div');
    badge.className = 'letter-status';
    badge.textContent = '✓ Utkast – gjennomgå før sending';
    header.prepend(badge);
  }

  let meta = box.querySelector('.letter-meta');
  if (!meta) {
    meta = document.createElement('div');
    meta.className = 'letter-meta';
    meta.innerHTML = `
      <div class="letter-meta-row"><span class="letter-meta-label">Til</span><span class="letter-meta-value">Fakturautsteder</span></div>
      <div class="letter-meta-row"><span class="letter-meta-label">Emne</span><span class="letter-meta-value" id="letterSubject">Avklaring av faktura</span></div>`;
    draft.before(meta);
  }

  function addText(parent, tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = text;
    parent.appendChild(el);
    return el;
  }

  function addLabeled(parent, className, label, value) {
    const p = document.createElement('p');
    p.className = className;
    const strong = document.createElement('span');
    strong.className = 'letter-label';
    strong.textContent = label;
    p.append(strong, document.createTextNode(' ' + value));
    parent.appendChild(p);
  }

  let formatting = false;
  const observer = new MutationObserver(() => {
    if (!formatting) formatDraft();
  });

  function formatDraft() {
    const raw = draft.textContent.trim();
    if (!raw) return;
    formatting = true;
    observer.disconnect();

    const fragment = document.createDocumentFragment();
    let list = null;
    const lines = raw.split(/\r?\n/);

    for (const sourceLine of lines) {
      const line = sourceLine.trim();
      if (!line) { list = null; continue; }

      if (/^\d+\.\s/.test(line)) {
        list = null;
        addText(fragment, 'h4', 'letter-section', line);
        continue;
      }
      if (line.startsWith('Kontrollen viser:')) {
        list = null;
        addLabeled(fragment, 'letter-explainer', 'Kontrollen viser:', line.slice('Kontrollen viser:'.length).trim());
        continue;
      }
      if (line.startsWith('Det jeg ber om:')) {
        list = null;
        addLabeled(fragment, 'letter-request', 'Det jeg ber om:', line.slice('Det jeg ber om:'.length).trim());
        continue;
      }
      if (line === 'Dette gjelder:' || line === 'For å kunne avklare saken ber jeg også om svar på følgende:') {
        list = null;
        addText(fragment, 'p', 'letter-p letter-label', line);
        continue;
      }
      if (line === 'Tilleggsopplysning fra meg:') {
        list = null;
        addText(fragment, 'p', 'letter-note letter-label', line);
        continue;
      }
      if (line.startsWith('- ')) {
        if (!list) {
          list = document.createElement('ul');
          list.className = 'letter-list';
          fragment.appendChild(list);
        }
        addText(list, 'li', '', line.slice(2));
        continue;
      }

      list = null;
      let klass = 'letter-p';
      if (line === 'Hei,') klass += ' letter-greeting';
      if (line === 'Vennlig hilsen' || line === 'På forhånd takk for avklaringen.') klass += ' letter-signoff';
      addText(fragment, 'p', klass, line);
    }

    draft.replaceChildren(fragment);
    const title = document.getElementById('caseTitle')?.textContent?.trim();
    const subject = document.getElementById('letterSubject');
    if (subject) subject.textContent = title ? `Avklaring av faktura – ${title}` : 'Avklaring av faktura';

    formatting = false;
    observer.observe(draft, { childList: true, subtree: true, characterData: true });
  }

  observer.observe(draft, { childList: true, subtree: true, characterData: true });
  formatDraft();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installLetterPresentation, { once: true });
  else installLetterPresentation();
}
