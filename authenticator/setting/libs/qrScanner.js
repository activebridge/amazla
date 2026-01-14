/**
 * Scan QR code from an image file
 * @param {Event} e - Click event with nativeEvent.view.window
 * @param {Function} onStatus - Status callback (message: string) => void
 * @returns {Promise<string|null>} - QR code data or null if not found
 */
export function scanQRFromFile(e, onStatus) {
  return new Promise((resolve, reject) => {
    try {
      const doc = e.nativeEvent.view.window.document
      const win = e.nativeEvent.view.window

      const input = doc.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'

      input.onchange = async (evt) => {
        const file = evt.target.files[0]
        if (!file) {
          resolve(null)
          return
        }

        onStatus('Reading image...')

        const reader = new win.FileReader()
        reader.onload = async (readerEvt) => {
          const img = new win.Image()
          img.onload = async () => {
            try {
              onStatus(`Image: ${img.width}x${img.height}. Loading scanner...`)

              const canvas = doc.createElement('canvas')
              canvas.width = img.width
              canvas.height = img.height
              const ctx = canvas.getContext('2d')
              ctx.drawImage(img, 0, 0)
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

              // Load jsQR into window context if not already loaded
              if (!win.jsQR) {
                await new Promise((res, rej) => {
                  const script = doc.createElement('script')
                  script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
                  script.onload = res
                  script.onerror = rej
                  doc.head.appendChild(script)
                })
              }

              onStatus('Scanning QR...')
              const code = win.jsQR(imageData.data, imageData.width, imageData.height)

              if (code) {
                resolve(code.data)
              } else {
                onStatus(`No QR found in ${img.width}x${img.height} image.`)
                resolve(null)
              }
            } catch (err) {
              reject(err)
            }
          }
          img.onerror = () => reject(new Error('Error loading image'))
          img.src = readerEvt.target.result
        }
        reader.onerror = () => reject(new Error('Error reading file'))
        reader.readAsDataURL(file)
      }

      input.click()
    } catch (err) {
      reject(err)
    }
  })
}
