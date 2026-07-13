import { getDocument, setDocument } from './dom.js'

// (question, answer[, link]) — answers hold the usage/troubleshooting content that
// used to live in the page's Use section cards.
const FAQ = [
  [
    'How do I set it up?',
    'Phone → Watch → Key card → Tesla: enter the name and VIN here on the phone, tap "Pair" in the watch app, tap your NFC key card on the console when the watch prompts, then confirm the new key on the Tesla screen.',
  ],
  [
    'How do I lock or unlock the car?',
    'On the main page of the watch app, tap the lock/unlock button. Your car will respond immediately.',
  ],
  [
    'Where can I open it from?',
    'Four ways, quickest last: (1) from the watch app list; (2) as a shortcut card — swipe sideways from the watch face; (3) as a key-card widget in your app cards; (4) mapped to a physical button. The app, the shortcut card and the widget all connect and control the car the same way.',
  ],
  [
    'Unlock with a single button press',
    'On the watch, open Settings → Preferences → Press Button and assign "Amazla Key" to the button. Then turn on "Auto-Unlock on Connect" below. Now one press of that button opens the app, connects, and unlocks the car — no screen taps needed. (The app has to open to reach the car, so this is the closest thing to a car-key button.)',
  ],
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
    'No. The watch talks to the car directly over Bluetooth. As long as your watch is near the car (within 30 feet), it works — no phone, no internet.',
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

// Exclusive accordion: <details> sharing one name — opening an item closes the
// others natively, no JS.
const itemHtml = (q, i) => {
  const link = q[2]
    ? `<a class="faq-dialog-link" href="${q[2].url}" target="_blank" rel="noopener">${q[2].label}${EXTLINK_SVG}</a>`
    : ''
  return `
    <details class="faq-dialog-item${i === FAQ.length - 1 ? ' faq-dialog-item-last' : ''}" name="faq"${i === 0 ? ' open' : ''}>
      <summary class="faq-dialog-q">${q[0]}<span class="faq-dialog-chevron">▾</span></summary>
      <div class="faq-dialog-a">${q[1]}</div>
      ${link}
    </details>
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
      <div class="faq-dialog-header">
        <button id="faq-dialog-close" class="faq-dialog-x" type="button" aria-label="Close">✕</button>
        <div class="faq-dialog-title">FAQ</div>
        <span class="faq-dialog-x-spacer"></span>
      </div>
      <div class="faq-dialog-items">${FAQ.map(itemHtml).join('')}</div>
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

  // Exclusive-accordion fallback for webviews without <details name> support
  // (Chrome <120 / Safari <17.2): close the siblings whenever an item opens.
  // On engines with native support this is a no-op (they're already closed).
  overlay.addEventListener(
    'toggle',
    (ev) => {
      const item = ev.target
      if (!item.open) return
      for (const other of overlay.querySelectorAll('details.faq-dialog-item[open]')) {
        if (other !== item) other.open = false
      }
    },
    true, // toggle doesn't bubble — catch it in the capture phase
  )
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
      background: rgba(0, 0, 0, 0.55);
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
      padding: 16px 24px 24px;
      border-radius: 12px;
      background: #24272b;
      color: #e8eaed;
      display: flex; flex-direction: column;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
      animation: faq-box-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .faq-dialog-overlay.faq-dialog-closing .faq-dialog-box {
      animation: faq-box-in 220ms cubic-bezier(0.4, 0, 1, 1) reverse both;
    }
    .faq-dialog-header {
      display: flex; flex-direction: row; align-items: center;
      margin: 0 -8px 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      flex-shrink: 0;
    }
    .faq-dialog-x {
      width: 36px; height: 36px; flex-shrink: 0;
      background: none; border: none; cursor: pointer;
      color: #e8eaed; font-size: 18px; line-height: 1;
      display: flex; align-items: center; justify-content: center;
    }
    .faq-dialog-x-spacer { width: 36px; flex-shrink: 0; }
    .faq-dialog-title {
      flex: 1; text-align: center;
      font-size: 17px; font-weight: 600;
    }
    .faq-dialog-items {
      overflow-y: auto;
      display: flex; flex-direction: column;
    }
    .faq-dialog-item {
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      /* Smooth expand/collapse: lets block-size transition to/from the auto
         keyword. With ::details-content below this animates open AND close —
         including items auto-closed by the exclusive accordion. Webviews
         without support (Chromium <131) just toggle instantly. */
      interpolate-size: allow-keywords;
    }
    .faq-dialog-item::details-content {
      block-size: 0;
      overflow-y: clip;
      opacity: 0;
      transition:
        content-visibility 250ms allow-discrete,
        opacity 250ms ease,
        block-size 250ms ease;
    }
    .faq-dialog-item[open]::details-content {
      block-size: auto;
      opacity: 1;
    }
    .faq-dialog-item-last {
      border-bottom: none;
    }
    .faq-dialog-q {
      font-weight: 500; font-size: 15px; color: #e8eaed;
      padding: 13px 0;
      cursor: pointer;
      display: flex; flex-direction: row; align-items: center;
      justify-content: space-between; gap: 10px;
      list-style: none;
    }
    .faq-dialog-q::-webkit-details-marker { display: none; }
    .faq-dialog-chevron {
      color: rgba(255, 255, 255, 0.55);
      font-size: 12px;
      flex-shrink: 0;
      transition: transform 200ms ease;
    }
    .faq-dialog-item[open] .faq-dialog-chevron {
      transform: rotate(180deg);
    }
    .faq-dialog-a {
      font-size: 13px; color: rgba(255, 255, 255, 0.55); line-height: 1.5;
      padding-bottom: 14px;
    }
    .faq-dialog-link {
      display: inline-flex; align-items: center; gap: 4px;
      color: #ef5350;
      font-size: 14px; font-weight: 600;
      text-decoration: none;
      padding-bottom: 14px;
    }
    .faq-dialog-link:hover { color: #ff7670; text-decoration: underline; }
    .faq-dialog-extlink { flex-shrink: 0; }
  `
  doc.head.appendChild(style)
}
