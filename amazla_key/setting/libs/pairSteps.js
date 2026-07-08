import { getDocument, setDocument } from './dom.js'

// (number, title, description, optional link) — link renders as the red
// "Tesla App"-style anchor (kzl.io purchase page).
const STEPS = [
  [
    'Open "Add Key" on Tesla',
    'Get in the car and have your NFC key card ready in hand. On the center screen, tap Car → Locks → Add Key.',
  ],
  [
    'Tap Pair on Watch',
    'Open "Amazla Key" app on the watch and tap "Pair" button and follow the instructions on the watch.',
  ],
  [
    'Tap NFC Card on Console',
    'The watch will vibrate and prompt you to tap your NFC key card. Place it flat on the console reader (between the front seats, behind the cup holders).',
  ],
  [
    'Confirm on Tesla Screen',
    'Tesla will show the new key. Tap "Confirm" on the center screen to authorize your watch.',
  ],
  [
    'Purchase the App',
    'The watch shows a purchase code. On your phone, open the payment page below, enter the code and complete the payment. The watch unlocks automatically.',
    { url: 'https://kzl.io/amazla', label: 'kzl.io/amazla' },
  ],
  [
    'Rename the Key (Optional)',
    'Tesla lists the new key as "Phone". On the center screen, tap Car → Locks → "Phone" → rename it (e.g. "Watch") so you can identify it later.',
  ],
]

const EXTLINK_SVG =
  '<svg class="pair-dialog-extlink" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M9.5 2.5h4v4M13.5 2.5L7 9M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/></svg>'

const stepHtml = (s, i) => {
  const link = s[2]
    ? `<a class="pair-dialog-link" href="${s[2].url}" target="_blank" rel="noopener">${s[2].label}${EXTLINK_SVG}</a>`
    : ''
  return `
    <div class="pair-dialog-step${i === STEPS.length - 1 ? ' pair-dialog-step-last' : ''}">
      <div class="pair-dialog-step-title"><span class="pair-dialog-num">${i + 1}.</span> ${s[0]}</div>
      <div class="pair-dialog-step-desc">${s[1]}</div>
      ${link}
    </div>
  `
}

export const openPairStepsDialog = (e) => {
  if (!setDocument(e)) return
  const doc = getDocument()
  injectStyles(doc)
  if (doc.querySelector('#pair-dialog')) return

  const overlay = doc.createElement('div')
  overlay.id = 'pair-dialog'
  overlay.className = 'pair-dialog-overlay'
  overlay.setAttribute('aria-hidden', 'true')
  overlay.innerHTML = `
    <div class="pair-dialog-box">
      <div class="pair-dialog-header">
        <button id="pair-dialog-close" class="pair-dialog-x" type="button" aria-label="Close">✕</button>
        <div class="pair-dialog-title">How to Pair</div>
        <span class="pair-dialog-x-spacer"></span>
      </div>
      <div class="pair-dialog-steps">${STEPS.map(stepHtml).join('')}</div>
    </div>
  `
  doc.body.appendChild(overlay)

  const close = () => {
    if (overlay.classList.contains('pair-dialog-closing')) return
    overlay.classList.add('pair-dialog-closing')
    setTimeout(() => overlay.remove(), 240)
  }

  doc.querySelector('#pair-dialog-close').addEventListener('click', close)
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) close()
  })
}

const injectStyles = (doc) => {
  if (doc.querySelector('#pair-dialog-styles')) return
  const style = doc.createElement('style')
  style.id = 'pair-dialog-styles'
  style.textContent = `
    @keyframes pair-overlay-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes pair-box-in {
      from { opacity: 0; transform: translateY(12px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .pair-dialog-overlay {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000;
      animation: pair-overlay-in 220ms ease both;
    }
    .pair-dialog-overlay.pair-dialog-closing {
      animation: pair-overlay-in 200ms ease reverse both;
    }
    .pair-dialog-box {
      width: min(92vw, 420px);
      max-height: 86vh;
      padding: 16px 24px 24px;
      border-radius: 12px;
      background: #24272b;
      color: #e8eaed;
      display: flex; flex-direction: column;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
      animation: pair-box-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .pair-dialog-overlay.pair-dialog-closing .pair-dialog-box {
      animation: pair-box-in 220ms cubic-bezier(0.4, 0, 1, 1) reverse both;
    }
    .pair-dialog-header {
      display: flex; flex-direction: row; align-items: center;
      margin: 0 -8px 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      flex-shrink: 0;
    }
    .pair-dialog-x {
      width: 36px; height: 36px; flex-shrink: 0;
      background: none; border: none; cursor: pointer;
      color: #e8eaed; font-size: 18px; line-height: 1;
      display: flex; align-items: center; justify-content: center;
    }
    .pair-dialog-x-spacer { width: 36px; flex-shrink: 0; }
    .pair-dialog-title {
      flex: 1; text-align: center;
      font-size: 17px; font-weight: 600;
    }
    .pair-dialog-steps {
      overflow-y: auto;
      display: flex; flex-direction: column;
    }
    .pair-dialog-step {
      display: flex; flex-direction: column; gap: 6px;
      padding-bottom: 14px; margin-bottom: 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .pair-dialog-step-last {
      padding-bottom: 0; margin-bottom: 0; border-bottom: none;
    }
    .pair-dialog-step-title {
      font-weight: 500; font-size: 15px; color: #e8eaed;
    }
    .pair-dialog-num {
      color: rgba(255, 255, 255, 0.55);
    }
    .pair-dialog-step-desc {
      font-size: 13px; color: rgba(255, 255, 255, 0.55); line-height: 1.5;
    }
    .pair-dialog-link {
      display: inline-flex; align-items: center; gap: 4px;
      align-self: flex-start;
      color: #ef5350;
      font-size: 14px; font-weight: 600;
      text-decoration: none;
    }
    .pair-dialog-link:hover { color: #ff7670; text-decoration: underline; }
    .pair-dialog-extlink { flex-shrink: 0; }
  `
  doc.head.appendChild(style)
}
