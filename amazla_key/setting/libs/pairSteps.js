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
  ['Done!', 'Your watch is now paired! Go back to the main page and test: tap lock/unlock to control your car.'],
]

const EXTLINK_SVG =
  '<svg class="pair-dialog-extlink" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M9.5 2.5h4v4M13.5 2.5L7 9M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/></svg>'

// Filled circled-number glyphs instead of styled badge elements.
const NUMBER_GLYPHS = ['❶', '❷', '❸', '❹', '❺', '❻', '❼', '❽', '❾']

const stepHtml = (s, i) => {
  const link = s[2]
    ? `<a class="pair-dialog-link" href="${s[2].url}" target="_blank" rel="noopener">${s[2].label}${EXTLINK_SVG}</a>`
    : ''
  return `
    <div class="pair-dialog-step${i === STEPS.length - 1 ? ' pair-dialog-step-last' : ''}">
      <div class="pair-dialog-step-title"><span class="pair-dialog-num">${NUMBER_GLYPHS[i] || i + 1}</span> ${s[0]}</div>
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
      <div class="pair-dialog-title">🔗 How to Pair</div>
      <div class="pair-dialog-steps">${STEPS.map(stepHtml).join('')}</div>
      <div class="pair-dialog-actions">
        <button id="pair-dialog-close" class="pair-dialog-btn" type="button">Close</button>
      </div>
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
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
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
      padding: 24px;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(24px) saturate(160%);
      -webkit-backdrop-filter: blur(24px) saturate(160%);
      border: 1px solid rgba(255, 255, 255, 0.25);
      color: white;
      display: flex; flex-direction: column;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      animation: pair-box-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .pair-dialog-overlay.pair-dialog-closing .pair-dialog-box {
      animation: pair-box-in 220ms cubic-bezier(0.4, 0, 1, 1) reverse both;
    }
    .pair-dialog-title {
      font-size: 18px; font-weight: 700; margin-bottom: 16px;
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
      font-family: ui-rounded, "SF Pro Rounded", system-ui, -apple-system, Roboto, sans-serif;
      font-weight: bold; font-size: 15px; color: white;
    }
    .pair-dialog-num {
      font-size: 34px;
      line-height: 1;
      vertical-align: middle;
      /* Fallback for webviews without sibling-index() (Chromium <138 / Safari) */
      color: rgb(120, 180, 255);
      text-shadow: 0 0 12px rgba(120, 180, 255, 0.45), 0 1px 0 rgba(0, 0, 0, 0.25);
    }
    /* Blue→green progression, derived in pure CSS from each step's position:
       t = (index - 1) / (last - 1), then mix green into blue by t. */
    @supports (width: calc(sibling-index() * 1px)) {
      .pair-dialog-step {
        --t: calc((sibling-index() - 1) / ${STEPS.length - 1} * 100%);
      }
      .pair-dialog-num {
        --num-color: color-mix(in srgb, rgb(60, 200, 120) var(--t), rgb(70, 140, 255));
        color: var(--num-color);
        text-shadow: 0 0 12px color-mix(in srgb, var(--num-color) 45%, transparent), 0 1px 0 rgba(0, 0, 0, 0.25);
      }
    }
    .pair-dialog-step-desc {
      font-size: 13px; color: rgba(255, 255, 255, 0.75); line-height: 1.5;
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
    .pair-dialog-actions {
      display: flex; justify-content: flex-end; margin-top: 18px;
    }
    .pair-dialog-btn {
      padding: 11px 22px; border-radius: 12px;
      cursor: pointer; font-size: 14px; font-weight: 600;
      color: white;
      border: 1px solid rgba(150, 195, 255, 0.55);
      background: linear-gradient(180deg, rgba(120, 180, 255, 0.6), rgba(70, 140, 255, 0.35));
      text-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.4),
        inset 0 -1px 0 rgba(0, 0, 0, 0.22),
        0 4px 14px rgba(50, 120, 255, 0.4);
      transition: transform 120ms ease, box-shadow 200ms ease, background 200ms ease;
    }
    .pair-dialog-btn:active { transform: translateY(1px); }
    .pair-dialog-btn:hover {
      background: linear-gradient(180deg, rgba(140, 195, 255, 0.7), rgba(90, 160, 255, 0.45));
    }
  `
  doc.head.appendChild(style)
}
