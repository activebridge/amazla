import { getDocument, setDocument } from './dom.js'
import { injectGlassStyles } from './glass.js'
import { store } from '../store.js'

const OUTPUTS = [
  { name: '🍞 Toast', value: 'toast' },
  { name: '💬 Alert', value: 'alert' },
  { name: '📄 Result Screen', value: 'notification' },
]

const BUTTONS = [1, 2, 3, 4]

const escapeText = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const escapeAttr = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')

const option = ({ name, value }, selected) =>
  `<option value="${escapeAttr(value)}"${String(value) === String(selected) ? ' selected' : ''}>${escapeText(name)}</option>`

// The watch-wide settings. Same injected-glass dialog as the action editor, so
// it lives on document.body and survives the re-render each control triggers.
export const openSettingsDialog = (e) => {
  if (!setDocument(e)) return
  const doc = getDocument()
  injectGlassStyles(doc)
  if (doc.querySelector('#settings-dialog')) return

  const config = store.config

  // A leading empty option, or an unset press action would silently display as
  // whichever action happens to be first.
  const pressOptions = [{ name: '— none —', value: '' }].concat(
    store.actions.data.map((a) => ({ name: a.title || 'Untitled', value: a.id })),
  )

  const overlay = doc.createElement('div')
  overlay.id = 'settings-dialog'
  overlay.className = 'g-overlay'
  overlay.innerHTML = `
    <div class="g-box">
      <div class="g-header">
        <button id="sd-close" class="g-x" type="button" aria-label="Close">✕</button>
        <div class="g-title">⚙️ Settings</div>
        <span class="g-x-spacer"></span>
      </div>
      <div class="g-body">
        <label class="g-label" for="sd-buttons">⌚ № of Buttons per Page — <span id="sd-buttons-value">${config.buttons}</span></label>
        <div class="g-range-wrap">
          <div class="g-range-track">
            <div id="sd-buttons-fill" class="g-range-fill"></div>
            ${BUTTONS.map(() => '<span class="g-range-dot"></span>').join('')}
          </div>
          <input id="sd-buttons" class="g-range" type="range" min="1" max="4" step="1" list="sd-buttons-ticks" value="${config.buttons}">
        </div>
        <datalist id="sd-buttons-ticks">
          ${BUTTONS.map((b) => `<option value="${b}" label="${b}"></option>`).join('')}
        </datalist>

        <label class="g-label" for="sd-output">👀 Result Display</label>
        <select id="sd-output" class="g-select">
          ${OUTPUTS.map((o) => option(o, config.output)).join('')}
        </select>

        <label class="g-label" for="sd-press">🔘 Button Press Action (long press to exit)</label>
        <select id="sd-press" class="g-select">
          ${pressOptions.map((o) => option(o, config.press || '')).join('')}
        </select>

        <div class="g-switches">
          <label class="g-switch">
            <span>💡 Keep Screen On</span>
            <input id="sd-awake" type="checkbox"${config.awake ? ' checked' : ''}>
            <span class="g-track"></span>
          </label>
          <label class="g-switch">
            <span>🔚 Exit on Success</span>
            <input id="sd-exit" type="checkbox"${config.exit ? ' checked' : ''}>
            <span class="g-track"></span>
          </label>
          <label class="g-switch">
            <span>📳 Vibration Feedback</span>
            <input id="sd-vibrate" type="checkbox"${config.vibrate ? ' checked' : ''}>
            <span class="g-track"></span>
          </label>
        </div>
      </div>
    </div>
  `
  doc.body.appendChild(overlay)

  const close = () => {
    if (overlay.classList.contains('g-closing')) return
    overlay.classList.add('g-closing')
    setTimeout(() => overlay.remove(), 240)
  }

  overlay.querySelector('#sd-close').addEventListener('click', close)
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) close()
  })

  // Every control writes straight through — no save button, same as the DSL
  // section it replaces.
  const on = (id, read, apply) => {
    overlay.querySelector(id).addEventListener('change', (ev) => apply(read(ev.target)))
  }
  const value = (el) => el.value
  const checked = (el) => el.checked

  // The range only commits on release; the readout and the rail's tinted part
  // follow the thumb. The rail is drawn by .g-range-track behind the input, so
  // the fill is a real element's width, not a track pseudo-element the webview
  // refuses to style.
  const buttonsRange = overlay.querySelector('#sd-buttons')
  const buttonsValue = overlay.querySelector('#sd-buttons-value')
  const buttonsFill = overlay.querySelector('#sd-buttons-fill')
  const paintRange = () => {
    buttonsValue.textContent = buttonsRange.value
    buttonsFill.style.width = `${((Number(buttonsRange.value) - 1) / 3) * 100}%`
  }
  buttonsRange.addEventListener('input', paintRange)
  paintRange()
  on('#sd-buttons', value, (v) => { store.config.buttons = parseInt(v, 10) })
  on('#sd-output', value, (v) => { store.config.output = v })
  on('#sd-press', value, (v) => { store.config.press = v })
  on('#sd-awake', checked, (v) => { store.config.awake = v })
  on('#sd-exit', checked, (v) => { store.config.exit = v })
  on('#sd-vibrate', checked, (v) => { store.config.vibrate = v })
}
