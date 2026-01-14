import { parseMigrationUrl, parseOtpauthUrl, parseJSONExport } from '../libs/migration'
import { SECTION, PRIMARY_BUTTON, HINT_TEXT } from '../styles.js'

let fileInput = null

const ensureInputInjected = (e) => {
  const doc = e.nativeEvent.view.window.document
  const win = e.nativeEvent.view.window

  if (!fileInput || !doc.body.contains(fileInput)) {
    fileInput = doc.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/*,.json,application/json'
    fileInput.style.cssText = 'position:fixed;top:-9999px;left:-9999px;'
    doc.body.appendChild(fileInput)
  }

  return { doc, win }
}

const importFromUrl = (data, store) => {
  try {
    let newAccounts = []

    if (data.startsWith('otpauth-migration://')) {
      newAccounts = parseMigrationUrl(data)
    } else if (data.startsWith('otpauth://')) {
      newAccounts = [parseOtpauthUrl(data)]
    } else {
      throw new Error('Unknown URL format')
    }

    const result = store.accounts.add(newAccounts)
    store.status = result.message
  } catch (err) {
    store.status = `Error: ${err.message}`
  }
}

const processImage = async (file, e, store) => {
  const win = e.nativeEvent.view.window
  const doc = e.nativeEvent.view.window.document

  store.status = 'Reading image...'
  const reader = new win.FileReader()

  reader.onload = async (readerEvt) => {
    const img = new win.Image()
    img.onload = async () => {
      try {
        store.status = `Scanning ${img.width}x${img.height}...`
        const canvas = doc.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

        if (!win.jsQR) {
          await new Promise((res, rej) => {
            const script = doc.createElement('script')
            script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
            script.onload = res
            script.onerror = rej
            doc.head.appendChild(script)
          })
        }

        const code = win.jsQR(imageData.data, imageData.width, imageData.height)
        if (code) {
          importFromUrl(code.data, store)
        } else {
          store.status = 'No QR code found in image'
        }
      } catch (err) {
        store.status = `Error: ${err.message}`
      }
    }
    img.onerror = () => { store.status = 'Error loading image' }
    img.src = readerEvt.target.result
  }
  reader.onerror = () => { store.status = 'Error reading file' }
  reader.readAsDataURL(file)
}

const processJSON = (file, e, store) => {
  const win = e.nativeEvent.view.window

  store.status = 'Reading JSON...'
  const reader = new win.FileReader()

  reader.onload = (readerEvt) => {
    try {
      const newAccounts = parseJSONExport(readerEvt.target.result)
      const result = store.accounts.add(newAccounts)
      store.status = result.message
    } catch (err) {
      store.status = `Error: ${err.message}`
    }
  }
  reader.onerror = () => { store.status = 'Error reading file' }
  reader.readAsText(file)
}

const handleImport = (e, store) => {
  try {
    ensureInputInjected(e)

    fileInput.onchange = (evt) => {
      const file = evt.target.files[0]
      if (!file) return

      const isImage = file.type.startsWith('image/')
      const isJSON = file.type === 'application/json' || file.name.endsWith('.json')

      if (isImage) {
        processImage(file, e, store)
      } else if (isJSON) {
        processJSON(file, e, store)
      } else {
        store.status = 'Unsupported file type'
      }

      fileInput.value = ''
    }

    fileInput.click()
  } catch (err) {
    store.status = `Error: ${err.message}`
  }
}

const handleUrlInput = (url, store) => {
  if (!url) return

  if (url.startsWith('otpauth-migration://') || url.startsWith('otpauth://')) {
    importFromUrl(url, store)
  } else {
    store.status = 'Invalid URL format'
  }
  setTimeout(() => store.clearUrlInput(), 10)
}

const URL_INPUT_WRAPPER = {
  marginTop: '12px',
  background: 'black',
  border: '1px solid #8ab4f8',
  borderRadius: '24px',
}

const URL_INPUT_LABEL = {
  color: '#8ab4f8',
  fontSize: '14px',
  textAlign: 'center',
  display: 'block',
  padding: '14px 20px',
}

export const ImportSection = (store) =>
  View({ style: SECTION }, [
    Button({
      label: '+ Import from File',
      style: PRIMARY_BUTTON,
      onClick: (e) => handleImport(e, store),
    }),

    Text({ paragraph: true, style: HINT_TEXT }, 'QR screenshot or JSON (Aegis, 2FAS, andOTP, Raivo)'),

    TextInput({
      label: 'Paste URL',
      labelStyle: { ...URL_INPUT_LABEL, ...URL_INPUT_WRAPPER },
      placeholder: 'otpauth://...',
      settingsKey: 'url_input',
      onChange: (url) => handleUrlInput(url, store),
    }),
  ])
