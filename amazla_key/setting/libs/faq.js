import { getDocument, setDocument } from './dom.js'

// (question, answer[, link]) — answers hold the usage/troubleshooting content that
// used to live in the page's Use section cards.
const FAQ = [
  [
    'How do I set it up?',
    'Phone → Watch → Key card → Tesla: enter the name and VIN here on the phone, tap "Pair" in the watch app, tap your NFC key card on the console when the watch prompts, then confirm the new key on the Tesla screen.',
  ],
  ['How do I lock or unlock the car?', 'On the main page of the watch app, tap the lock/unlock button. Your car will respond immediately.'],
  [
    'Does it unlock as I walk up?',
    'Yes — keep the app open as you approach and the car unlocks by itself, just like a phone key. Walk-away lock works the same, but only while the app stays open.',
  ],
  [
    'Why does walk-up unlock take a moment?',
    'After the watch connects, the car runs its own authorization handshake before it starts trusting the key — that takes around 9 seconds. Open the app a little before you reach the car and passive entry will be ready when you pull the handle.',
  ],
  [
    'Does it work in the background?',
    'No — the app must stay open on the watch screen. The watch OS does not allow Bluetooth connections from background apps, so passive entry and auto-lock stop the moment the app closes. This is a platform limit, not a setting.',
  ],
  [
    'Do I need my phone with me?',
    "No. The watch talks to the car directly over Bluetooth. As long as your watch is near the car (within 30 feet), it works — no phone, no internet.",
  ],
  [
    'How fast does it connect?',
    'Typically a few seconds from opening the app to being connected. If the car is asleep, the first command also wakes it, which can add a few seconds.',
  ],
  [
    'Is it secure?',
    'Yes — it uses the same digital-key protocol as the Tesla phone key. The keys live on your watch and phone only; nothing is uploaded or stored anywhere else.',
  ],
  [
    'Can it lock the car automatically?',
    'Enable "Auto-Lock on Exit" in settings: when you close the app, the car locks — unless someone is still inside. "Auto-Unlock on Connect" does the opposite on arrival.',
  ],
  [
    'How do I purchase the app?',
    'After pairing, the watch shows a purchase code. Open the payment page below, enter the code and complete the payment. The watch unlocks automatically.',
    { url: 'https://kzl.io/amazla', label: 'kzl.io/amazla' },
  ],
  [
    'It cannot find my car — why?',
    'The watch finds your Tesla by a name derived from the VIN, so even one wrong character means the car is never found. Double-check the VIN above (copy it from the Tesla app to be safe), make sure the car is awake, and try again.',
  ],
  [
    'Pairing does not work — what now?',
    'First verify the VIN is correct. Then on the watch app, tap "Reset" to remove the old pairing, and start over from "How to Pair" step 1.',
  ],
  [
    'What does Reset actually remove?',
    'Reset wipes the key from the watch and phone only — the car still remembers it. Delete it on the Tesla too: on the center screen, tap Car → Locks, find the key (e.g. "Phone" or "Watch") and remove it before pairing again.',
  ],
  [
    'Still stuck? Contact us',
    'Write to us and we will help you out:',
    { url: 'mailto:contact@amazla.com?subject=Amazla%20Key%20support', label: 'contact@amazla.com' },
  ],
]

const EXTLINK_SVG =
  '<svg class="faq-dialog-extlink" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M9.5 2.5h4v4M13.5 2.5L7 9M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/></svg>'

const itemHtml = (q, i) => {
  const link = q[2]
    ? `<a class="faq-dialog-link" href="${q[2].url}" target="_blank" rel="noopener">${q[2].label}${EXTLINK_SVG}</a>`
    : ''
  return `
    <div class="faq-dialog-item${i === FAQ.length - 1 ? ' faq-dialog-item-last' : ''}">
      <div class="faq-dialog-q">${q[0]}</div>
      <div class="faq-dialog-a">${q[1]}</div>
      ${link}
    </div>
  `
}

export const openFaqDialog = (e) => {
  if (!setDocument(e)) return
  const doc = getDocument()
  injectStyles(doc)
  if (doc.querySelector('#faq-dialog')) return

  const overlay = doc.createElement('div')
  overlay.id = 'faq-dialog'
  overlay.className = 'faq-dialog-overlay'
  overlay.setAttribute('aria-hidden', 'true')
  overlay.innerHTML = `
    <div class="faq-dialog-box">
      <div class="faq-dialog-title">❓ FAQ</div>
      <div class="faq-dialog-items">${FAQ.map(itemHtml).join('')}</div>
      <div class="faq-dialog-actions">
        <button id="faq-dialog-close" class="faq-dialog-btn" type="button">Close</button>
      </div>
    </div>
  `
  doc.body.appendChild(overlay)

  const close = () => {
    if (overlay.classList.contains('faq-dialog-closing')) return
    overlay.classList.add('faq-dialog-closing')
    setTimeout(() => overlay.remove(), 240)
  }

  doc.querySelector('#faq-dialog-close').addEventListener('click', close)
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) close()
  })
}

const injectStyles = (doc) => {
  if (doc.querySelector('#faq-dialog-styles')) return
  const style = doc.createElement('style')
  style.id = 'faq-dialog-styles'
  style.textContent = `
    @keyframes faq-overlay-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes faq-box-in {
      from { opacity: 0; transform: translateY(12px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .faq-dialog-overlay {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000;
      animation: faq-overlay-in 220ms ease both;
    }
    .faq-dialog-overlay.faq-dialog-closing {
      animation: faq-overlay-in 200ms ease reverse both;
    }
    .faq-dialog-box {
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
      animation: faq-box-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .faq-dialog-overlay.faq-dialog-closing .faq-dialog-box {
      animation: faq-box-in 220ms cubic-bezier(0.4, 0, 1, 1) reverse both;
    }
    .faq-dialog-title {
      font-size: 18px; font-weight: 700; margin-bottom: 16px;
    }
    .faq-dialog-items {
      overflow-y: auto;
      display: flex; flex-direction: column;
    }
    .faq-dialog-item {
      display: flex; flex-direction: column; gap: 6px;
      padding-bottom: 14px; margin-bottom: 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .faq-dialog-item-last {
      padding-bottom: 0; margin-bottom: 0; border-bottom: none;
    }
    .faq-dialog-q {
      font-family: ui-rounded, "SF Pro Rounded", system-ui, -apple-system, Roboto, sans-serif;
      font-weight: bold; font-size: 15px; color: white;
    }
    .faq-dialog-a {
      font-size: 13px; color: rgba(255, 255, 255, 0.75); line-height: 1.5;
    }
    .faq-dialog-link {
      display: inline-flex; align-items: center; gap: 4px;
      align-self: flex-start;
      color: #ef5350;
      font-size: 14px; font-weight: 600;
      text-decoration: none;
    }
    .faq-dialog-link:hover { color: #ff7670; text-decoration: underline; }
    .faq-dialog-extlink { flex-shrink: 0; }
    .faq-dialog-actions {
      display: flex; justify-content: flex-end; margin-top: 18px;
    }
    .faq-dialog-btn {
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
    .faq-dialog-btn:active { transform: translateY(1px); }
    .faq-dialog-btn:hover {
      background: linear-gradient(180deg, rgba(140, 195, 255, 0.7), rgba(90, 160, 255, 0.45));
    }
  `
  doc.head.appendChild(style)
}
