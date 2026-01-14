import { parseMigrationUrl, parseOtpauthUrl, parseJSONExport } from '../../libs/migration'
import { store } from '../../store.js'

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

const importFromUrl = (data) => {
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

const processImage = async (file, e) => {
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
          importFromUrl(code.data)
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

const processJSON = (file, e) => {
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

const handleImport = (e) => {
  try {
    ensureInputInjected(e)

    fileInput.onchange = (evt) => {
      const file = evt.target.files[0]
      if (!file) return

      const isImage = file.type.startsWith('image/')
      const isJSON = file.type === 'application/json' || file.name.endsWith('.json')

      if (isImage) {
        processImage(file, e)
      } else if (isJSON) {
        processJSON(file, e)
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

const handleUrlInput = (url) => {
  if (!url) return

  if (url.startsWith('otpauth-migration://') || url.startsWith('otpauth://')) {
    importFromUrl(url)
  } else {
    store.status = 'Invalid URL format'
  }
  setTimeout(() => store.clearUrlInput(), 10)
}

const BUTTON_STYLE = {
  padding: '8px',
  background: 'transparent',
  border: 'none',
  fontSize: '20px',
  cursor: 'pointer',
  position: 'relative',
}

const OVERLAY_STYLE = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.5)',
  zIndex: 999,
  transition: 'opacity 0.3s ease',
}

const DROPDOWN_STYLE = {
  position: 'absolute',
  top: '50px',
  right: '0',
  width: '300px',
  background: '#1D1E1F',
  border: 'none',
  borderRadius: '16px',
  padding: '16px',
  zIndex: 1000,
  boxShadow: '6px 6px 12px #0d0d0d, -4px -4px 10px #272727',
  transition: 'opacity 0.3s ease, transform 0.3s ease',
}

const MENU_BUTTON = {
  width: '100%',
  padding: '14px 16px',
  background: 'linear-gradient(145deg, #1c7efa, #1865c5)',
  color: 'white',
  border: 'none',
  borderRadius: '12px',
  fontSize: '14px',
  fontWeight: '500',
  textAlign: 'center',
  boxShadow: '3px 3px 6px #0d0d0d, -2px -2px 5px #272727',
}

const HINT_TEXT = {
  marginTop: '8px',
  fontSize: '11px',
  color: '#6e7377',
  textAlign: 'center',
}

const URL_INPUT_STYLE = {
  marginTop: '12px',
  background: '#1D1E1F',
  border: 'none',
  borderRadius: '12px',
  color: '#8ab4f8',
  fontSize: '14px',
  textAlign: 'center',
  display: 'block',
  padding: '14px 16px',
  boxShadow: '3px 3px 6px #0d0d0d, -2px -2px 5px #272727',
}

const ADD_BUTTON_STYLE = {
  background: 'linear-gradient(145deg, #1c7efa, #1865c5)',
  border: 'none',
  borderRadius: '50%',
  width: '36px',
  height: '36px',
  minWidth: '36px',
  minHeight: '36px',
  padding: '0',
  fontSize: '24px',
  color: 'white',
  fontWeight: '300',
  lineHeight: '36px',
  textAlign: 'center',
  cursor: 'pointer',
  boxSizing: 'border-box',
  paddingBottom: '2px',
  boxShadow: '3px 3px 6px #0d0d0d, -2px -2px 5px #272727',
}

export const AddButton = () => {
  return View({ style: BUTTON_STYLE }, [
    Button({
      label: '+',
      style: ADD_BUTTON_STYLE,
      onClick: () => { store.showAddMenu = !store.showAddMenu },
    }),

    View({
      style: {
        ...OVERLAY_STYLE,
        opacity: store.showAddMenu ? 1 : 0,
        pointerEvents: store.showAddMenu ? 'auto' : 'none',
      },
      onClick: () => { store.showAddMenu = false },
    }, []),

    View({ style: {
      ...DROPDOWN_STYLE,
      opacity: store.showAddMenu ? 1 : 0,
      pointerEvents: store.showAddMenu ? 'auto' : 'none',
      transform: store.showAddMenu ? 'translateY(0)' : 'translateY(-10px)',
    }}, [
      Button({
        label: 'Import from File',
        style: MENU_BUTTON,
        onClick: (e) => {
          handleImport(e)
          store.showAddMenu = false
        },
      }),

      Text({ paragraph: true, style: HINT_TEXT }, 'QR screenshot or JSON'),

      TextInput({
        label: 'Paste URL',
        labelStyle: URL_INPUT_STYLE,
        placeholder: 'otpauth://...',
        settingsKey: 'url_input',
        onChange: (url) => {
          handleUrlInput(url)
          store.showAddMenu = false
        },
      }),
    ]),
  ])
}
