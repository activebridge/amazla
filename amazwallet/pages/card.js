import { encodeEAN13 } from './../utils/ean13'
import { encodeCode39 } from './../utils/code39'
import { encodeCode128 } from './../utils/code128'
import UI, {
  button,
  text,
  rect,
  circle
} from "./../../pages/ui"

let card = {}
let brightness, isAutoBright = false

const { width, height, screenShape } = hmSetting?.getDeviceInfo()
const isLandscape = height === width && width > 368
const isRound = screenShape === 1

const qr = ({ color, code }) => {
  circle({ color: color, alpha: 255, bar: 0})
  rect({ color: 0xFFFFFF, radius: 10, w: width, h: height, bar: 0 })
  text({ text: 'QR code \n is not supported', color: 0x000000 })
  isRound && hmUI.createWidget(hmUI.widget.QRCODE, {
    content: code,
    x: width/5 - 15,
    y: width/5 - 15,
    w: width/1.5,
    h: width/1.5,
  })

  !isRound && hmUI.createWidget(hmUI.widget.QRCODE, {
    content: code,
    x: 20,
    y: 20,
    w: width - 40,
    h: width - 40,
  })

  button({ click_func, w: width, h: height, src: '_' })
}

const click_func = () => hmApp.goBack()

Page({
  onInit(param) {
    card = JSON.parse(param)
    brightness = hmSetting.getBrightness()
    isAutoBright = hmSetting.getScreenAutoBright()
  },

  build() {
    hmUI.setStatusBarVisible(false)
    hmSetting.setBrightScreen(300)
    hmSetting.setScreenAutoBright(false)
    hmSetting.setBrightness(100)
    hmUI.setScrollView(false)
    hmUI.setLayerScrolling(false)

    console.log(JSON.stringify(card))

    // Migrate old qr boolean to type
    if (card.qr === true && !card.type) card.type = 'qr'
    if (!card.type) card.type = 'ean13' // Default for old cards

    const type = card.type
    const code = card.code || ''

    // Handle QR code type
    if (type === 'qr') {
      return qr(card)
    }

    // Handle barcode types (EAN-13, Code 39, Code 128)
    const paddedCode = type === 'ean13' ? String(code).padStart(13, "0") : code
    let lines
    if (type === 'ean13') {
      lines = encodeEAN13(paddedCode)
    } else if (type === 'code39') {
      lines = encodeCode39(paddedCode)
    } else if (type === 'code128') {
      lines = encodeCode128(paddedCode)
    } else {
      lines = encodeEAN13(paddedCode) // fallback
    }

    if (!lines || lines.length === 0) {
      return text({ text: "Invalid barcode data" })
    }

    // Render barcode background
    rect({ color: card.color, bar: 0 })
    isLandscape && text({ text: card.title, y: -150, color: 0x000000, text_size: 40 })
    isLandscape && text({ text: card.title, y: -151, color: 0xffffff, text_size: 40 })
    isLandscape && text({ text: card.code, y: 150, color: 0x000000, text_size: 30 })
    isLandscape && text({ text: card.code, y: 151, color: 0xffffff, text_size: 30 })

    let w = 220
    let h = 410
    if (isLandscape) w = 410, h = 220
    rect({ color: 0xFFFFFF, h: h, w: w, radius: 20 })

    // Calculate bar width with minimum 2px for scannability
    const MIN_BAR_WIDTH = 2 // Minimum pixels per module for scanner compatibility
    const totalWidth = 360
    let barWidth = totalWidth / lines.length

    // If bars would be too thin, use minimum width and reduce total barcode width
    if (barWidth < MIN_BAR_WIDTH) {
      barWidth = MIN_BAR_WIDTH
    }

    const barcodeWidth = barWidth * lines.length
    const offset = (totalWidth - barcodeWidth) / 2 // Center the barcode

    lines.map((l, i) => {
      const h = isLandscape ? 360 : barWidth
      const w = isLandscape ? barWidth : 360
      const x = isLandscape ? i * barWidth - barcodeWidth/2 : 0
      const y = isLandscape ? 0 : i * barWidth - barcodeWidth/2
      l === 1 && rect({ x, y, w, h, color: 0x000000 })
    })

    button({ click_func, w: width, h: height, src: '_' })
  },

  onDestroy() {
    hmSetting.setBrightScreenCancel()
    hmSetting.setBrightness(brightness)
    hmSetting.setScreenAutoBright(isAutoBright)
    UI.reset()
  }
})
