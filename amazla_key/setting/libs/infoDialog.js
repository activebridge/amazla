import { getDocument, setDocument } from './dom.js'

// Generic single-topic info modal — same look as the "How to Pair" dialog, opened by
// the little (i) icon next to a setting. openInfoDialog(e, title, bodyHtml): title is
// plain text, bodyHtml is a small HTML string (may contain <b>, <br>, <ul>/<li>).
export const openInfoDialog = (e, title, bodyHtml) => {
  if (!setDocument(e)) return
  const doc = getDocument()
  injectStyles(doc)
  if (doc.querySelector('#info-dialog')) return

  const overlay = doc.createElement('div')
  overlay.id = 'info-dialog'
  overlay.className = 'info-dialog-overlay'
  overlay.setAttribute('aria-hidden', 'true')
  overlay.innerHTML = `
    <div class="info-dialog-box">
      <div class="info-dialog-header">
        <button id="info-dialog-close" class="info-dialog-x" type="button" aria-label="Close">✕</button>
        <div class="info-dialog-title">${title}</div>
        <span class="info-dialog-x-spacer"></span>
      </div>
      <div class="info-dialog-body">${bodyHtml}</div>
    </div>
  `
  doc.body.appendChild(overlay)

  const close = () => {
    if (overlay.classList.contains('info-dialog-closing')) return
    overlay.classList.add('info-dialog-closing')
    setTimeout(() => overlay.remove(), 240)
  }

  doc.querySelector('#info-dialog-close').addEventListener('click', close)
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) close()
  })
}

const injectStyles = (doc) => {
  if (doc.querySelector('#info-dialog-styles')) return
  const style = doc.createElement('style')
  style.id = 'info-dialog-styles'
  style.textContent = `
    @keyframes info-overlay-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes info-box-in {
      from { opacity: 0; transform: translateY(12px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .info-dialog-overlay {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000;
      animation: info-overlay-in 220ms ease both;
    }
    .info-dialog-overlay.info-dialog-closing {
      animation: info-overlay-in 200ms ease reverse both;
    }
    .info-dialog-box {
      width: min(92vw, 420px);
      max-height: 86vh;
      padding: 16px 24px 24px;
      border-radius: 12px;
      background: #24272b;
      color: #e8eaed;
      display: flex; flex-direction: column;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
      animation: info-box-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .info-dialog-overlay.info-dialog-closing .info-dialog-box {
      animation: info-box-in 220ms cubic-bezier(0.4, 0, 1, 1) reverse both;
    }
    .info-dialog-header {
      display: flex; flex-direction: row; align-items: center;
      margin: 0 -8px 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      flex-shrink: 0;
    }
    .info-dialog-x {
      width: 36px; height: 36px; flex-shrink: 0;
      background: none; border: none; cursor: pointer;
      color: #e8eaed; font-size: 18px; line-height: 1;
      display: flex; align-items: center; justify-content: center;
    }
    .info-dialog-x-spacer { width: 36px; flex-shrink: 0; }
    .info-dialog-title {
      flex: 1; text-align: center;
      font-size: 17px; font-weight: 600;
    }
    .info-dialog-body {
      overflow-y: auto;
      font-size: 14px; color: rgba(255, 255, 255, 0.72); line-height: 1.6;
    }
    .info-dialog-body b { color: #e8eaed; font-weight: 600; }
    .info-dialog-body ul { margin: 8px 0 0; padding-left: 18px; }
    .info-dialog-body li { margin: 4px 0; }
  `
  doc.head.appendChild(style)
}
