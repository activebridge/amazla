import { setDocument, getDocument, findElementByText } from './dom.js'
import { parseMigrationUrl, parseOtpauthUrl } from './migration.js'
import { store } from '../store.js'

let initialized = false
let input = null

export const initUrlInput = (e) => {
  if (!setDocument(e)) return
  if (initialized) return
  initialized = true
  setup()
}

// otpauth://totp/Label?secret=BASE32&issuer=Example
const OTPAUTH_PATTERN = 'otpauth:\\/\\/([tT][oO][tT][pP]|[hH][oO][tT][pP])\\/[^?]+\\?.*[sS][eE][cC][rR][eE][tT]=[A-Za-z2-7]+=*.*'

// otpauth-migration://offline?data=BASE64
const MIGRATION_PATTERN = 'otpauth-migration:\\/\\/offline\\?data=[A-Za-z0-9+/=]+'

// Combined pattern for HTML5 validation
const COMBINED_PATTERN = `(${OTPAUTH_PATTERN})|(${MIGRATION_PATTERN})`

const OTPAUTH_REGEX = new RegExp(`^${OTPAUTH_PATTERN}$`, 'i')
const MIGRATION_REGEX = new RegExp(`^${MIGRATION_PATTERN}$`)

const importFromUrl = (data) => {
  try {
    let newAccounts = []

    if (MIGRATION_REGEX.test(data)) {
      newAccounts = parseMigrationUrl(data)
    } else if (OTPAUTH_REGEX.test(data)) {
      newAccounts = [parseOtpauthUrl(data)]
    } else {
      throw new Error('Invalid URL format')
    }

    const result = store.accounts.add(newAccounts)
    store.status = result.message
  } catch (err) {
    store.status = `Error: ${err.message}`
  }
}

const setup = () => {
  const doc = getDocument()

  const injectStyles = () => {
    if (doc.querySelector('#url-input-styles')) return

    const style = doc.createElement('style')
    style.id = 'url-input-styles'
    style.textContent = `
      input.url-input {
        color: #e8eaed;
        box-shadow: inset 3px 3px 6px #0d0d0d, inset -3px -3px 6px #272727;
      }
      input.url-input::placeholder { color: #6e7377; }
      input.url-input:focus { outline: none; }
      input.url-input:not(:placeholder-shown):valid {
        color: #81c784 !important;
        box-shadow: inset 3px 3px 6px #0d0d0d, inset -3px -3px 6px #272727, 0 0 12px rgba(129, 199, 132, 0.8) !important;
      }
      input.url-input:not(:placeholder-shown):invalid {
        color: #ef5350 !important;
        box-shadow: inset 3px 3px 6px #0d0d0d, inset -3px -3px 6px #272727, 0 0 12px rgba(239, 83, 80, 0.8) !important;
      }
    `
    doc.head.appendChild(style)
  }

  const createInput = (textElement) => {
    const container = textElement.parentElement

    input = doc.createElement('input')
    input.type = 'text'
    input.className = 'url-input'
    input.placeholder = 'otpauth://...'
    input.pattern = COMBINED_PATTERN
    input.title = 'Supported formats:\n• otpauth://totp/Label?secret=BASE32\n• otpauth://hotp/Label?secret=BASE32\n• otpauth-migration://offline?data=BASE64'
    input.style.cssText = `
      position: absolute;
      inset: 0;
      border: none;
      border-radius: 12px;
      padding: 10px 14px 10px 36px;
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      outline: none;
      background: #1D1E1F;
      width: 100%;
      box-sizing: border-box;
    `

    injectStyles()

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleSubmit()
      }
    })

    input.addEventListener('blur', () => {
      if (input.value.trim()) {
        handleSubmit()
      }
    })

    textElement.remove()
    container.appendChild(input)
  }

  const handleSubmit = () => {
    const url = input?.value?.trim()
    if (!url) return

    if (!input.checkValidity()) {
      input.reportValidity()
      return
    }

    importFromUrl(url)
    store.showAddMenu = false
    input.value = ''
  }

  const tryCreateInput = () => {
    if (input) return

    const textElement = findElementByText('Paste URL')
    if (textElement) {
      createInput(textElement)
    }
  }

  // Create input immediately on init
  tryCreateInput()
}
