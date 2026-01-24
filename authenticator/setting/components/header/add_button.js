import { parseMigrationUrl, parseOtpauthUrl, parseJSONExport } from '../../libs/migration'
import { store } from '../../store.js'

const ensureInputInjected = (e) => {
  const doc = e.nativeEvent.view.window.document
  const win = e.nativeEvent.view.window

  // Remove existing input if any
  const existing = doc.getElementById('import-input')
  if (existing) existing.remove()

  doc.body.insertAdjacentHTML('beforeend', `<input id="import-input" type="file" accept="image/*,.json,application/json" multiple style="position:fixed;top:-9999px;left:-9999px;">`)

  return { doc, win, input: doc.getElementById('import-input') }
}

const parseUrl = (data) => {
  if (data.startsWith('otpauth-migration://')) {
    return parseMigrationUrl(data)
  } else if (data.startsWith('otpauth://')) {
    return [parseOtpauthUrl(data)]
  } else {
    throw new Error('Unknown URL format')
  }
}

const processImage = (file, e) => {
  const win = e.nativeEvent.view.window
  const doc = e.nativeEvent.view.window.document

  return new Promise((resolve) => {
    const reader = new win.FileReader()

    reader.onload = async (readerEvt) => {
      const img = new win.Image()
      img.onload = async () => {
        try {
          const canvas = doc.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

          if (!win.jsQR) {
            await new Promise((res) => {
              const check = () => win.jsQR ? res() : setTimeout(check, 50)
              check()
            })
          }

          const code = win.jsQR(imageData.data, imageData.width, imageData.height)
          if (code) {
            resolve(parseUrl(code.data))
          } else {
            resolve({ error: 'No QR code found' })
          }
        } catch (err) {
          resolve({ error: err.message })
        }
      }
      img.onerror = () => resolve({ error: 'Error loading image' })
      img.src = readerEvt.target.result
    }
    reader.onerror = () => resolve({ error: 'Error reading file' })
    reader.readAsDataURL(file)
  })
}

const processJSON = (file, e) => {
  const win = e.nativeEvent.view.window

  return new Promise((resolve) => {
    const reader = new win.FileReader()

    reader.onload = (readerEvt) => {
      try {
        resolve(parseJSONExport(readerEvt.target.result))
      } catch (err) {
        resolve({ error: err.message })
      }
    }
    reader.onerror = () => resolve({ error: 'Error reading file' })
    reader.readAsText(file)
  })
}

const handleImport = (e) => {
  try {
    const { input } = ensureInputInjected(e)

    input.onchange = async (evt) => {
      const files = Array.from(evt.target.files)
      if (!files.length) return

      store.status = 'Importing...'

      const promises = []
      for (const file of files) {
        const isImage = file.type.startsWith('image/')
        const isJSON = file.type === 'application/json' || file.name.endsWith('.json')

        if (isImage) {
          promises.push(processImage(file, e))
        } else if (isJSON) {
          promises.push(processJSON(file, e))
        }
      }

      const results = await Promise.all(promises)
      const allAccounts = []
      const errors = []

      for (const result of results) {
        if (result.error) {
          errors.push(result.error)
        } else if (Array.isArray(result)) {
          allAccounts.push(...result)
        }
      }

      if (allAccounts.length > 0) {
        const { added } = store.accounts.add(allAccounts)
        let status = added > 0
          ? `Added ${added} account${added === 1 ? '' : 's'}`
          : 'Accounts already exist'
        if (errors.length > 0) {
          status += `. ${errors.length} file${errors.length === 1 ? '' : 's'} failed`
        }
        store.status = status
      } else if (errors.length > 0) {
        store.status = errors[0]
      }

      input.remove()
    }

    setTimeout(() => input.click(), 0)
  } catch (err) {
    store.status = `Error: ${err.message}`
  }
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

const URL_INPUT_CONTAINER = {
  marginTop: '12px',
  position: 'relative',
  height: '40px',
}

const URL_ICON = {
  position: 'absolute',
  left: '14px',
  top: '50%',
  transform: 'translateY(-50%)',
  fontSize: '14px',
  zIndex: 1,
  pointerEvents: 'none',
}

const URL_PLACEHOLDER = {
  color: '#6e7377',
  lineHeight: '40px',
  fontSize: '14px',
  paddingLeft: '36px',
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

      View({ style: URL_INPUT_CONTAINER }, [
        Text({ style: URL_ICON }, '🔗'),
        Text({ style: URL_PLACEHOLDER }, 'Paste URL'),
      ]),
    ]),
  ])
}
