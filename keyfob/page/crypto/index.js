// Crypto page - generates and caches ephemeral keypair
import * as hmUI from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { writeFileSync, readFileSync } from '@zos/fs'
import * as p256 from '../../lib/tesla-ble/crypto/p256.js'

const { width, height } = getDeviceInfo()
const PREGEN_FILE = 'pregen_keypair.json'

Page({
  build() {
    const statusText = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0,
      y: height / 2 - 50,
      w: width,
      h: 100,
      text: 'Checking cache...',
      text_size: 24,
      color: 0xFFFFFF,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V
    })

    setTimeout(() => {
      // Check for cached keypair
      let cached = null
      try {
        const data = readFileSync({ path: PREGEN_FILE, options: { encoding: 'utf8' } })
        if (data) cached = JSON.parse(data)
      } catch (e) {}

      if (cached && cached.privateHex && cached.publicHex) {
        const age = Math.round((Date.now() - cached.timestamp) / 1000)
        statusText.setProperty(hmUI.prop.TEXT, `Cached!\n${age}s old\nReady for BLE`)
        statusText.setProperty(hmUI.prop.COLOR, 0x00FF00)
        return
      }

      // Generate new keypair
      statusText.setProperty(hmUI.prop.TEXT, 'Generating...')

      setTimeout(() => {
        try {
          const t0 = Date.now()

          const privateKey = p256.generatePrivateKey()
          const publicKey = p256.getPublicKey(privateKey)

          const elapsed = Date.now() - t0

          // Save to file
          const privateHex = Array.from(privateKey).map(b => b.toString(16).padStart(2, '0')).join('')
          const publicHex = Array.from(publicKey).map(b => b.toString(16).padStart(2, '0')).join('')

          writeFileSync({
            path: PREGEN_FILE,
            data: JSON.stringify({ privateHex, publicHex, timestamp: Date.now() }),
            options: { encoding: 'utf8' }
          })

          statusText.setProperty(hmUI.prop.TEXT, `Generated!\n${Math.round(elapsed/1000)}s\nSaved to cache`)
          statusText.setProperty(hmUI.prop.COLOR, 0x00FF00)
        } catch (e) {
          console.log('Crypto err:', e)
          statusText.setProperty(hmUI.prop.TEXT, 'Error:\n' + (e.message || e))
          statusText.setProperty(hmUI.prop.COLOR, 0xFF0000)
        }
      }, 100)
    }, 100)
  }
})
