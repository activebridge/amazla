import { getDocument, setDocument } from './dom.js'
import { injectGlassStyles } from './glass.js'
import { store } from '../store.js'

const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']

const ICONS = [
  '▶', '•', '★', '☆', '☉', '☏', '☜', '☞', '☟', '♡', '♢', '♤', '♧', '♪',
  '♫', '♬', '♲', '♳', '♴', '♵', '♶', '♷', '♸', '♹',
  '♺', '♼', '♽', '✓', '✚', '✽', '℻', '☖', '☗',
  '✿', '❀', '❖', '❶', '❷', '❸', '❹', '❺', '❻', '❼',
  '❽', '❾', '❿', '℀', '℃', '℉', 'Ω', '℧', 'ℵ',
]

const TITLE_MAX = 30
const RUNNING = '⏳ Running…'

const escapeAttr = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
const escapeText = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

// Add / edit an action. index = number to edit an existing one, or null to add.
// The dialog is appended to document.body, outside the settings render tree, so
// a re-render triggered by any storage write cannot tear it down mid-edit.
export const openActionDialog = (e, index = null) => {
  if (!setDocument(e)) return
  const doc = getDocument()
  injectGlassStyles(doc)
  if (doc.querySelector('#action-dialog')) return

  const isNew = index == null
  const action = isNew ? {} : (store.actions.all[Number(index)]?.data || {})

  // Both change once a new action is saved for the first time, so the dialog
  // stays pointed at the row it just created.
  let target = isNew ? null : Number(index)
  let id = action.id || null

  const icon = action.icon || ICONS[0]
  const method = action.method || 'GET'

  const overlay = doc.createElement('div')
  overlay.id = 'action-dialog'
  overlay.className = 'g-overlay'
  overlay.innerHTML = `
    <div class="g-box">
      <div class="g-header">
        <button id="ad-close" class="g-x" type="button" aria-label="Close">✕</button>
        <div class="g-title">${isNew ? 'New Action' : 'Edit Action'}</div>
        <span class="g-x-spacer"></span>
      </div>
      <form id="ad-form" class="g-body">
        <label class="g-label" for="ad-title">✏️ Title</label>
        <input id="ad-title" class="g-input g-validate" type="text" placeholder="Run" maxlength="${TITLE_MAX}" required value="${escapeAttr(action.title)}">

        <div class="g-row">
          <div class="g-col g-col-sm">
            <label class="g-label" for="ad-icon">🖼️ Icon</label>
            <select id="ad-icon" class="g-select">
              ${ICONS.map((i) => `<option value="${escapeAttr(i)}"${i === icon ? ' selected' : ''}>${escapeText(i)}</option>`).join('')}
            </select>
          </div>
          <div class="g-col">
            <label class="g-label" for="ad-method">⚙️ Method</label>
            <select id="ad-method" class="g-select">
              ${METHODS.map((m) => `<option value="${m}"${m === method ? ' selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
        </div>

        <label class="g-label" for="ad-url">🔗 URL</label>
        <input id="ad-url" class="g-input g-validate" type="url" placeholder="https://api.url.com" inputmode="url" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" required value="${escapeAttr(action.url)}">

        <label class="g-label" for="ad-headers">👤 Headers</label>
        <textarea id="ad-headers" class="g-textarea" rows="3" placeholder="Authorization=Token&#10;Another header=value" autocapitalize="off" autocorrect="off" spellcheck="false">${escapeText(action.headers)}</textarea>

        <label class="g-label" for="ad-body">📄 Body</label>
        <textarea id="ad-body" class="g-textarea" rows="3" placeholder="key=value" autocapitalize="off" autocorrect="off" spellcheck="false">${escapeText(action.body)}</textarea>

        <label class="g-switch">
          <span>🧩 Parse JSON response</span>
          <input id="ad-json" type="checkbox"${action.json ? ' checked' : ''}>
          <span class="g-track"></span>
        </label>

        <div id="ad-keys"${action.json ? '' : ' hidden'}>
          <label class="g-label" for="ad-success">✅ Success Key</label>
          <input id="ad-success" class="g-input" type="text" placeholder="data.0.result" autocapitalize="off" autocorrect="off" spellcheck="false" value="${escapeAttr(action.successKey)}">

          <label class="g-label" for="ad-error">⛔ Error Key</label>
          <input id="ad-error" class="g-input" type="text" placeholder="data.error.message" autocapitalize="off" autocorrect="off" spellcheck="false" value="${escapeAttr(action.errorKey)}">
        </div>

        <div class="g-actions">
          <button id="ad-run" class="g-run" type="button">▶ Run</button>
          <button id="ad-save" class="g-save" type="submit">Save</button>
        </div>
      </form>
      <div id="ad-result" class="g-result" hidden>
        <span id="ad-result-text" class="g-result-text"></span>
        <button id="ad-result-x" class="g-result-x" type="button" aria-label="Dismiss">✕</button>
      </div>
    </div>
  `
  doc.body.appendChild(overlay)

  const form = overlay.querySelector('#ad-form')
  const resultEl = overlay.querySelector('#ad-result')
  const resultText = overlay.querySelector('#ad-result-text')
  const jsonInput = overlay.querySelector('#ad-json')
  const keysBlock = overlay.querySelector('#ad-keys')

  let pollTimer = null

  const showResult = (text) => {
    resultText.textContent = text
    resultEl.hidden = false
  }

  // Dismissing also stops a pending poll, or a late answer would reopen the
  // panel the user just closed.
  const dismissResult = () => {
    clearInterval(pollTimer)
    resultText.textContent = ''
    resultEl.hidden = true
  }

  overlay.querySelector('#ad-result-x').addEventListener('click', dismissResult)

  const close = () => {
    if (overlay.classList.contains('g-closing')) return
    clearInterval(pollTimer)
    overlay.classList.add('g-closing')
    setTimeout(() => overlay.remove(), 240)
  }

  overlay.querySelector('#ad-close').addEventListener('click', close)
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) close()
  })

  jsonInput.addEventListener('change', () => {
    keysBlock.hidden = !jsonInput.checked
  })

  const collect = () => ({
    title: overlay.querySelector('#ad-title').value.trim(),
    icon: overlay.querySelector('#ad-icon').value,
    url: overlay.querySelector('#ad-url').value.trim(),
    method: overlay.querySelector('#ad-method').value,
    headers: overlay.querySelector('#ad-headers').value,
    body: overlay.querySelector('#ad-body').value,
    json: jsonInput.checked,
    successKey: overlay.querySelector('#ad-success').value.trim(),
    errorKey: overlay.querySelector('#ad-error').value.trim(),
  })

  // One storage write either way: create appends the whole record, save merges
  // every field at once.
  const persist = () => {
    const data = collect()
    if (target == null) {
      id = String(Date.now())
      store.actions.create({ ...data, id })
      target = store.actions.data.length - 1
    } else {
      store.actions.all[target]?.save(data)
    }
  }

  // Same path the watch uses: app-side listens for the 'test' key, runs the
  // request and writes back 'result'. The dialog sits above the settings Toast,
  // so the answer is polled and shown here instead.
  overlay.querySelector('#ad-run').addEventListener('click', () => {
    if (!form.reportValidity()) return
    persist()

    // The running state is shown here, not written to storage: a stored result
    // also raises the settings Toast, which the dialog covers. Clearing it
    // instead arms the poll — the next non-empty value is app-side's answer.
    showResult(RUNNING)
    store.result = ''
    store.test = String(id)

    clearInterval(pollTimer)
    let waited = 0
    pollTimer = setInterval(() => {
      waited += 300
      const result = store.result
      if (result) {
        showResult(result)
        clearInterval(pollTimer)
      } else if (waited >= 30000) {
        showResult('⌛ No response')
        clearInterval(pollTimer)
      }
    }, 300)
  })

  // Native validation (required / type=url / maxlength) gates submit — this
  // only fires once the browser's constraints pass.
  form.addEventListener('submit', (ev) => {
    ev.preventDefault()
    persist()
    close()
  })
}
