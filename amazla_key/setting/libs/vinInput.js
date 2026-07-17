import { getDocument, setDocument } from './dom.js'

const VIN_PATTERN = '(5YJ|7SA|LRW|XP7|SFZ)[A-HJ-NPR-Z0-9]{14}'

export const openVehicleDialog = (e, settingsStorage) => {
  if (!setDocument(e)) return
  const doc = getDocument()
  injectStyles(doc)
  if (doc.querySelector('#vin-dialog')) return

  const overlay = doc.createElement('div')
  overlay.id = 'vin-dialog'
  overlay.className = 'vin-dialog-overlay'
  overlay.setAttribute('aria-hidden', 'true')
  overlay.innerHTML = `
    <div class="vin-dialog-box">
      <div class="vin-dialog-header">
        <button id="vin-dialog-cancel" class="vin-dialog-x" type="button" aria-label="Close">✕</button>
        <div class="vin-dialog-title">Vehicle Info</div>
        <span class="vin-dialog-x-spacer"></span>
      </div>
      <label class="vin-dialog-label" for="vin-dialog-name">Tesla Name</label>
      <input id="vin-dialog-name" type="text" class="vin-dialog-input" placeholder="My Tesla" maxlength="20" />
      <div class="vin-dialog-hint">
        Shown on the watch when the car is nearby.
      </div>
      <label class="vin-dialog-label" for="vin-dialog-vin">Tesla VIN <span class="vin-dialog-required">*</span></label>
      <input id="vin-dialog-vin" type="text" class="vin-dialog-input vin-input" placeholder="17 characters" maxlength="17" autocapitalize="characters" spellcheck="false" required />
      <div class="vin-dialog-hint">
        Stored locally · never uploaded.
        <span>You can copy VIN from <a class="vin-dialog-tesla-link" href="tesla://">Tesla App<svg class="vin-dialog-extlink" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M9.5 2.5h4v4M13.5 2.5L7 9M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/></svg></a></span>
      </div>
      <div class="vin-dialog-actions">
        <button id="vin-dialog-ok" class="vin-dialog-btn vin-dialog-btn-primary" type="button">OK</button>
      </div>
    </div>
  `
  doc.body.appendChild(overlay)

  const nameInput = doc.querySelector('#vin-dialog-name')
  const vinInput = doc.querySelector('#vin-dialog-vin')
  nameInput.value = settingsStorage.getItem('vehicleName') || ''
  vinInput.value = settingsStorage.getItem('vehicleVin') || ''
  vinInput.pattern = VIN_PATTERN
  vinInput.title = 'Tesla VIN: 17 characters\nPrefix: 5YJ, 7SA, LRW, XP7, or SFZ\nNo I, O, or Q'

  vinInput.addEventListener('input', () => {
    const upper = vinInput.value.toUpperCase()
    if (vinInput.value !== upper) {
      const pos = vinInput.selectionStart
      vinInput.value = upper
      try {
        vinInput.setSelectionRange(pos, pos)
      } catch {}
    }
  })

  const close = () => {
    if (overlay.classList.contains('vin-dialog-closing')) return
    overlay.classList.add('vin-dialog-closing')
    setTimeout(() => overlay.remove(), 240)
  }

  doc.querySelector('#vin-dialog-cancel').addEventListener('click', close)
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) close()
  })

  doc.querySelector('#vin-dialog-ok').addEventListener('click', () => {
    const vin = vinInput.value.trim().toUpperCase()
    vinInput.value = vin
    if (!vin) {
      vinInput.setCustomValidity('Tesla VIN is required')
      vinInput.reportValidity()
      vinInput.addEventListener('input', () => vinInput.setCustomValidity(''), { once: true })
      return
    }
    vinInput.setCustomValidity('')
    if (!vinInput.checkValidity()) {
      vinInput.reportValidity()
      return
    }
    settingsStorage.setItem('vehicleName', nameInput.value.trim().slice(0, 20))
    settingsStorage.setItem('vehicleVin', vin)
    close()
  })

  const target = !nameInput.value ? nameInput : !vinInput.value ? vinInput : null
  if (target) setTimeout(() => target.focus(), 220)
}

const injectStyles = (doc) => {
  if (doc.querySelector('#vin-dialog-styles')) return
  const style = doc.createElement('style')
  style.id = 'vin-dialog-styles'
  style.textContent = `
    @keyframes vin-overlay-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes vin-box-in {
      from { opacity: 0; transform: translateY(12px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .vin-dialog-overlay {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000;
      animation: vin-overlay-in 220ms ease both;
    }
    .vin-dialog-overlay.vin-dialog-closing {
      animation: vin-overlay-in 200ms ease reverse both;
    }
    .vin-dialog-box {
      width: min(92vw, 420px);
      padding: 16px 24px 24px;
      border-radius: 12px;
      background: #24272b;
      color: #e8eaed;
      display: flex; flex-direction: column;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
      animation: vin-box-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .vin-dialog-overlay.vin-dialog-closing .vin-dialog-box {
      animation: vin-box-in 220ms cubic-bezier(0.4, 0, 1, 1) reverse both;
    }
    .vin-dialog-header {
      display: flex; flex-direction: row; align-items: center;
      margin: 0 -8px 8px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .vin-dialog-x {
      width: 36px; height: 36px; flex-shrink: 0;
      background: none; border: none; cursor: pointer;
      color: #e8eaed; font-size: 18px; line-height: 1;
      display: flex; align-items: center; justify-content: center;
    }
    .vin-dialog-x-spacer { width: 36px; flex-shrink: 0; }
    .vin-dialog-title {
      flex: 1; text-align: center;
      font-size: 17px; font-weight: 600;
    }
    .vin-dialog-label {
      font-size: 12px; text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55); letter-spacing: 1px;
      margin: 10px 0 4px;
    }
    .vin-dialog-required { color: #ef5350; }
    .vin-dialog-input {
      height: 42px; padding: 0 14px;
      border-radius: 8px; outline: none;
      border: 1px solid #3a3e44;
      background: #17191c;
      color: #e8eaed;
      /* 16px minimum — iOS zooms the whole page onto any focused input below 16px */
      font-size: 16px; font-family: inherit;
      transition: border-color 160ms ease;
    }
    .vin-dialog-input::placeholder { color: rgba(255, 255, 255, 0.35); }
    .vin-dialog-input:focus {
      border-color: #3e6ae1;
    }
    .vin-input:not(:placeholder-shown):valid {
      color: #81c784;
      border-color: rgba(129, 199, 132, 0.6);
    }
    .vin-input:not(:placeholder-shown):invalid {
      color: #ef5350;
      border-color: rgba(239, 83, 80, 0.6);
    }
    /* Submit with no VIN: reportValidity() focuses the field, and required makes
       it :invalid — so focused+invalid shows red even while the placeholder-shown
       guard above blocks the empty case. */
    .vin-input:focus:invalid {
      color: #ef5350;
      border-color: rgba(239, 83, 80, 0.6);
    }
    .vin-dialog-hint {
      display: flex; flex-direction: column; gap: 10px;
      font-size: 13px; line-height: 1.45;
      color: rgba(255, 255, 255, 0.55);
    }
    .vin-dialog-hint b { color: rgba(255, 255, 255, 0.9); font-weight: 600; }
    .vin-dialog-tesla-link {
      display: inline-flex; align-items: center; gap: 4px;
      color: #ef5350;
      font-weight: 600;
      text-decoration: none;
    }
    .vin-dialog-tesla-link:hover { color: #ff7670; text-decoration: underline; }
    .vin-dialog-extlink { flex-shrink: 0; }
    .vin-dialog-actions {
      display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px;
    }
    .vin-dialog-btn {
      padding: 11px 26px; border-radius: 8px;
      cursor: pointer; font-size: 14px; font-weight: 500;
      border: none;
      transition: background 160ms ease;
    }
    .vin-dialog-btn-primary {
      color: white;
      background: #3e6ae1;
    }
    .vin-dialog-btn-primary:hover {
      background: #5578e6;
    }
  `
  doc.head.appendChild(style)
}
