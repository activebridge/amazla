import { getDocument, setDocument } from './dom.js'
import { store } from '../store.js'

const TYPES = [
  { value: 'ean13', label: 'EAN-13' },
  { value: 'code39', label: 'CODE 39' },
  { value: 'code128', label: 'CODE 128' },
  { value: 'qr', label: 'QR' },
]

// 10 curated colors — new cards cycle through them by position, so the order
// matters as much as the set: consecutive entries sit at least ~75 degrees of
// hue apart, or two cards added back to back look like the same card.
const PALETTE = [
  0xeb5757, 0x16a085, 0xf2994a, 0x2f80ed, 0xf2c94c,
  0x9b51e0, 0x8bc34a, 0xeb5fa6, 0x27ae60, 0xbb6bd9,
]
const DEFAULT_COLOR = PALETTE[0]
const NAME_MAX = 30

// Per-type native constraints for the Code field. Length is baked into the
// pattern so an over-long value is flagged :invalid (maxlength only caps typing).
// inputmode picks the phone keyboard: a digits-only symbology has no business
// opening QWERTY, and a QR payload is usually a URL.
const CODE_RULES = {
  // A shorter GTIN is zero-padded to 13 on the watch and stays valid, so EAN-8
  // (8) and UPC-A (12) go in this field as they are printed.
  ean13: { pattern: '[0-9]{8,13}', maxlength: 13, placeholder: '0123456789012', title: 'Digits only: EAN-13, UPC-A (12) or EAN-8 (8)', inputmode: 'numeric' },
  code39: { pattern: '[0-9A-Za-z .$/%+-]{1,10}', maxlength: 10, placeholder: 'ABC123', title: 'Letters, numbers and space - . $ / + %, up to 10', inputmode: 'text' },
  // Digits encode two per symbol (Code Set C), so a numeric code fits about
  // twice the characters at the same bar width on the watch.
  code128: { pattern: '([0-9]{1,20}|[ -~]{1,11})', maxlength: 20, placeholder: 'Member2024', title: 'Digits up to 20, other characters up to 11', inputmode: 'text' },
  qr: { pattern: '', maxlength: 500, placeholder: 'https://example.com', title: 'Any text or URL', inputmode: 'url' },
}

// EAN-13 check digit: weights 1/3 over the first 12 digits. Shorter GTINs are
// checked in their zero-padded 13-digit form — padding preserves the weights,
// so a valid EAN-8 or UPC-A passes unchanged.
const ean13CheckDigit = (code) => {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 ? 3 : 1)
  return (10 - (sum % 10)) % 10
}

const hex = (n) => '#' + Number(n || 0).toString(16).padStart(6, '0')


// Add / edit a card. index = number to edit an existing card, or null to add.
// Same DOM-injected modal style as amazla_key's info dialog.
export const openCardDialog = (e, index = null) => {
  if (!setDocument(e)) return
  const doc = getDocument()
  injectStyles(doc)
  if (doc.querySelector('#card-dialog')) return

  const isNew = index == null
  const card = isNew ? {} : (store.cards.all[Number(index)]?.data || {})

  let type = card.type || 'ean13'
  const color = card.color != null ? card.color : (isNew ? PALETTE[store.cards.all.length % PALETTE.length] : DEFAULT_COLOR)

  const overlay = doc.createElement('div')
  overlay.id = 'card-dialog'
  overlay.className = 'cd-overlay'
  overlay.innerHTML = `
    <div class="cd-box">
      <div class="cd-header">
        <button id="cd-close" class="cd-x" type="button" aria-label="Close">✕</button>
        <div class="cd-title">${isNew ? 'New Card' : 'Edit Card'}</div>
        <span class="cd-x-spacer"></span>
      </div>
      <form id="cd-form" class="cd-body">
        <label class="cd-label" for="cd-name">Name</label>
        <input id="cd-name" class="cd-input cd-validate" type="text" placeholder="Card name" maxlength="${NAME_MAX}" required value="${escapeAttr(card.title || '')}">

        <label class="cd-label" for="cd-code">Code</label>
        <input id="cd-code" class="cd-input cd-validate" type="text" placeholder="Card number" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" required value="${escapeAttr(card.code || '')}">

        <label class="cd-label">Type</label>
        <div id="cd-types" class="cd-types">
          ${TYPES.map((t) => `<button type="button" class="cd-type${t.value === type ? ' cd-selected' : ''}" data-type="${t.value}">${t.label}</button>`).join('')}
        </div>

        <label class="cd-label" for="cd-color">Color</label>
        <input id="cd-color" class="cd-input cd-color" type="color" value="${hex(color)}">


        <button id="cd-save" class="cd-save" type="submit">Save</button>
      </form>
    </div>
  `
  doc.body.appendChild(overlay)

  const close = () => {
    if (overlay.classList.contains('cd-closing')) return
    overlay.classList.add('cd-closing')
    setTimeout(() => overlay.remove(), 240)
  }

  overlay.querySelector('#cd-close').addEventListener('click', close)
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) close()
  })

  const codeInput = overlay.querySelector('#cd-code')

  const applyCodeRules = (t) => {
    const r = CODE_RULES[t] || CODE_RULES.ean13
    codeInput.maxLength = r.maxlength
    codeInput.placeholder = r.placeholder
    codeInput.title = r.title
    codeInput.inputMode = r.inputmode
    if (r.pattern) codeInput.setAttribute('pattern', r.pattern)
    else codeInput.removeAttribute('pattern')
    if (t === 'ean13') applyCheckDigit()
  }

  // A checksum is arithmetic, so no fixed pattern can express it — but the
  // pattern for one value is trivial: pin the last digit to the check digit the
  // rest of the code implies, and native validation blocks a wrong one on its own.
  const applyCheckDigit = () => {
    const r = CODE_RULES.ean13
    const value = codeInput.value
    if (value.length < 8) {
      codeInput.setAttribute('pattern', r.pattern)
      codeInput.title = r.title
      return
    }
    const expected = ean13CheckDigit(value.padStart(13, '0'))
    codeInput.setAttribute('pattern', '[0-9]{7,12}' + expected)
    codeInput.title = 'Check digit: the last digit should be ' + expected
  }
  codeInput.addEventListener('input', () => {
    if (type === 'ean13') applyCheckDigit()
  })
  applyCodeRules(type)

  overlay.querySelector('#cd-types').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.cd-type')
    if (!btn) return
    type = btn.dataset.type
    overlay.querySelectorAll('.cd-type').forEach((b) => b.classList.toggle('cd-selected', b === btn))
    applyCodeRules(type)
  })

  // Native form validation (required / maxlength) gates submit — the handler
  // only fires once the browser's constraints pass.
  overlay.querySelector('#cd-form').addEventListener('submit', (ev) => {
    ev.preventDefault()

    const code = codeInput.value

    const data = {
      title: overlay.querySelector('#cd-name').value.trim(),
      code,
      type,
      color: parseInt(overlay.querySelector('#cd-color').value.slice(1), 16),
    }

    if (isNew) {
      store.cards.add(data)
    } else {
      const target = store.cards.all[Number(index)]
      if (target) Object.keys(data).forEach((k) => target.save(k, data[k]))
    }

    close()
  })
}

const escapeAttr = (s) => String(s).replace(/"/g, '&quot;')

const injectStyles = (doc) => {
  if (doc.querySelector('#card-dialog-styles')) return
  const style = doc.createElement('style')
  style.id = 'card-dialog-styles'
  style.textContent = `
    @keyframes cd-overlay-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes cd-box-in {
      from { opacity: 0; transform: translateY(12px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    /* Glass: the card list stays visible and blurred behind the dialog, so the
       panel reads as frosted glass laid over it rather than a solid sheet. The
       colored cards showing through are what sells it — a flat scrim would kill
       the effect, so the overlay tint stays light. */
    .cd-overlay {
      position: fixed; inset: 0;
      background: rgba(10, 11, 13, 0.45);
      -webkit-backdrop-filter: blur(3px);
      backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000;
      animation: cd-overlay-in 220ms ease both;
    }
    .cd-overlay.cd-closing { animation: cd-overlay-in 200ms ease reverse both; }
    .cd-box {
      width: min(92vw, 420px); max-height: 86vh;
      padding: 16px 24px 24px; border-radius: 20px;
      /* Top-left lighter than bottom-right: the sheet catches light along one
         edge, which is what separates glass from flat translucency. */
      background:
        linear-gradient(145deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.04) 46%),
        rgba(30, 33, 38, 0.5);
      /* Blur far enough to abstract the cards, not so far they grind into gray:
         at 28px/0.62 the list behind turned to mush and the panel read as fogged
         plastic instead of glass. */
      -webkit-backdrop-filter: blur(18px) saturate(160%);
      backdrop-filter: blur(18px) saturate(160%);
      border: 1px solid rgba(255, 255, 255, 0.16);
      color: #e8eaed;
      display: flex; flex-direction: column;
      box-shadow:
        0 20px 50px rgba(0, 0, 0, 0.55),
        inset 0 1px 0 rgba(255, 255, 255, 0.22);
      animation: cd-box-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .cd-overlay.cd-closing .cd-box { animation: cd-box-in 220ms cubic-bezier(0.4, 0, 1, 1) reverse both; }
    .cd-header {
      display: flex; flex-direction: row; align-items: center;
      margin: 0 -8px 12px; padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.18); flex-shrink: 0;
    }
    .cd-x {
      width: 36px; height: 36px; flex-shrink: 0;
      background: none; border: none; cursor: pointer;
      color: #e8eaed; font-size: 18px; line-height: 1;
      display: flex; align-items: center; justify-content: center;
    }
    .cd-x-spacer { width: 36px; flex-shrink: 0; }
    .cd-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
    .cd-body { overflow-y: auto; display: flex; flex-direction: column; }
    .cd-label {
      font-size: 12px; color: rgba(255, 255, 255, 0.6); margin: 14px 0 6px;
      text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer;
    }
    /* Fields are glass too, one step darker than the panel so they read as wells
       cut into it. The neumorphic inset pair is gone — a hard dark shadow on a
       translucent surface looks like dirt under the glass. */
    .cd-input {
      width: 100%; box-sizing: border-box;
      padding: 12px 14px; border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.14); outline: none;
      background: rgba(10, 12, 15, 0.35); color: #e8eaed; font-size: 16px;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.35);
      transition: border-color 160ms ease, color 160ms ease, background 160ms ease;
    }
    .cd-input:focus {
      border-color: rgba(110, 160, 255, 0.75);
      background: rgba(10, 12, 15, 0.45);
    }
    /* Native validity styling — border only. Tinting the value itself made every
       filled field read green, which on a frosted panel looks like a state, not
       a confirmation. :not(:placeholder-shown) keeps the empty (untouched) state
       neutral; :focus:invalid shows red after a failed submit focuses the field. */
    .cd-validate:not(:placeholder-shown):valid {
      border-color: rgba(129, 199, 132, 0.7);
    }
    .cd-validate:not(:placeholder-shown):invalid {
      border-color: rgba(239, 83, 80, 0.75);
    }
    .cd-validate:focus:invalid {
      border-color: rgba(239, 83, 80, 0.75);
    }
    .cd-types { display: flex; flex-direction: row; gap: 8px; flex-wrap: wrap; }
    /* flex-basis auto, not 0: with flex 1 every button got an equal share
       regardless of its label, so "CODE 128" overflowed its border while "QR"
       sat in empty space. Sized to content first, then the slack is shared. */
    .cd-type {
      flex: 1 1 auto; min-width: 0; padding: 10px 6px; border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.06); color: #b9bfc6;
      font-size: 12px; white-space: nowrap; cursor: pointer;
      /* Recessed like the fields: dark from the top-left, light pooling at the
         bottom-right, kept shallow so it stays glass and not plastic. */
      box-shadow:
        inset 1px 1px 3px rgba(0, 0, 0, 0.4),
        inset -1px -1px 2px rgba(255, 255, 255, 0.1);
      transition: background 160ms ease, color 160ms ease;
    }
    .cd-type.cd-selected {
      background: linear-gradient(145deg, rgba(90, 160, 255, 0.85), rgba(30, 100, 220, 0.85));
      border-color: rgba(255, 255, 255, 0.3); color: white; font-weight: 500;
      /* Deeper inset than the unselected ones — the chosen type reads as pressed
         in, with the light rim still catching along the top edge. */
      box-shadow:
        inset 0 2px 5px rgba(0, 0, 0, 0.45),
        inset 0 1px 0 rgba(255, 255, 255, 0.35);
    }
    /* Same box as .cd-input — border, radius and inset shadow all inherited, so
       it only has to override the padding the swatch sits in. A color input's
       own height comes from its padding, not from a font. */
    .cd-color {
      height: 46px; padding: 6px; cursor: pointer;
      -webkit-appearance: none; appearance: none;
    }
    .cd-color::-webkit-color-swatch-wrapper { padding: 0; }
    .cd-color::-webkit-color-swatch {
      border: 1px solid rgba(0, 0, 0, 0.4); border-radius: 6px;
    }
    .cd-save {
      margin-top: 24px; width: 100%; padding: 14px;
      border: 1px solid rgba(255, 255, 255, 0.24); border-radius: 24px;
      background: linear-gradient(145deg, rgba(92, 162, 255, 0.95), rgba(28, 98, 220, 0.95));
      color: white;
      font-size: 15px; font-weight: 500; cursor: pointer;
      box-shadow:
        0 8px 20px rgba(20, 80, 200, 0.35),
        inset 0 1px 0 rgba(255, 255, 255, 0.35);
    }
  `
  doc.head.appendChild(style)
}
