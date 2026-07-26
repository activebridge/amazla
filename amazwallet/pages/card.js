import { encodeEAN13 } from './../utils/ean13'
import { encodeCode39 } from './../utils/code39'
import { encodeCode128 } from './../utils/code128'
import UI, {
  button,
  text,
  rect,
  img
} from "./../../pages/ui"

let card = {}
let brightness, isAutoBright = false

const { width, height, screenShape } = hmSetting?.getDeviceInfo()
const isRound = screenShape === 1

// Card color plus the same gradient overlay the list cards use.
const background = (color) => {
  const c = { centered: false, x: 0, y: 0, w: width, h: height }
  rect({ ...c, color: color != null ? color : 0x3a3a3a })
  img({ ...c, src: 'gradient_flip.png' })
}

const qr = ({ color, code }) => {
  background(color)
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
    // Zero-padding to 13 is how a shorter GTIN (EAN-8, UPC-A) becomes an EAN-13:
    // the check digit stays valid because the 1/3 weights keep their positions.
    const paddedCode = type === 'ean13' ? String(code).padStart(13, '0') : String(code)
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
    background(card.color)

    // White plate. `along` is the axis the modules run along, `across` is the
    // bar length. A code is drawn upright whenever it fits the screen width at
    // a scannable module — no reason to make the wrist turn for a short code —
    // and only rotates onto the taller axis when width alone can't hold it.
    const MIN_BAR_WIDTH = 2 // minimum pixels per module for scanner compatibility
    const QUIET_MODULES = 10 // spec: quiet zone is 10x the narrow element
    const MARGIN = 10 // keeps the plate on screen
    const MIN_QUIET = 6 // last-resort quiet zone for a code that barely fits
    const MIN_UPRIGHT_WIDTH = 240 // Band 7 (194) is always rotated: too narrow to be worth it
    const moduleFor = (axis) =>
      Math.floor(Math.min(410, axis - MARGIN * 2) / (lines.length + QUIET_MODULES * 2))
    const horizontal = width >= MIN_UPRIGHT_WIDTH && moduleFor(width) >= MIN_BAR_WIDTH
    const alongMax = (horizontal ? width : height) - MARGIN * 2
    const acrossMax = (horizontal ? height : width) - MARGIN * 2
    const alongWanted = Math.min(410, alongMax)
    const across = Math.min(220, acrossMax)

    // Module width is what makes a barcode readable, so pick the widest module
    // whose code AND both quiet zones fit — fat bars with a clipped quiet zone
    // read no better than thin ones. Whole pixels per module: a fractional width
    // gets floored per bar, which drifts and makes the quiet zones uneven.
    // 2px is a hard floor: below it a bar is not a barcode, it just looks like one.
    let barWidth = Math.floor(alongWanted / (lines.length + QUIET_MODULES * 2))
    if (barWidth < MIN_BAR_WIDTH) barWidth = MIN_BAR_WIDTH

    const barcodeLength = barWidth * lines.length

    // Past the input limits (Code 39 caps at 10 chars in settings) even 2px bars
    // don't fit — say so rather than draw an unreadable code.
    if (barcodeLength > alongMax - MIN_QUIET * 2) {
      text({ text: 'Code too long\nto scan on\nthis screen', text_size: 28, color: 0xffffff })
      return button({ click_func, w: width, h: height, src: '_' })
    }

    // Full quiet zone when the screen allows it, whatever is left over otherwise.
    const room = ((alongMax - barcodeLength) / 2) | 0
    const quiet = Math.min(barWidth * QUIET_MODULES, room)
    const along = Math.min(alongMax, Math.max(alongWanted, barcodeLength + quiet * 2))
    const barLength = across - MARGIN * 2
    const plateW = horizontal ? along : across
    const plateH = horizontal ? across : along
    rect({ color: 0xFFFFFF, w: plateW, h: plateH, radius: 20 })

    lines.map((l, i) => {
      // `rect` centers on the offset, so aim at the bar's center, not its top
      // edge — without the half-module the whole code sits barWidth/2 too high.
      const offset = i * barWidth - barcodeLength / 2 + barWidth / 2
      const x = horizontal ? offset : 0
      const y = horizontal ? 0 : offset
      const w = horizontal ? barWidth : barLength
      const h = horizontal ? barLength : barWidth
      l === 1 && rect({ x, y, w, h, color: 0x000000 })
    })

    // Code above the plate, card name below it — only when the plate leaves room
    // (a rotated code fills the screen and has none). Each label is drawn twice,
    // black then white one pixel up, so it reads on any card color.
    const NAME_SIZE = 36
    const CODE_SIZE = 32
    const labelRoom = ((height - plateH) / 2) | 0
    if (labelRoom >= NAME_SIZE + 12) {
      // Sit each label just off the plate edge rather than centered in the gap,
      // so both stay close to the barcode instead of hugging the screen edges.
      const label = (t, dir, size, char_space = 0) => {
        const y = dir * (((plateH + size) / 2 | 0) + 8)
        const base = { text: t, w: width - 20, text_size: size, char_space }
        text({ ...base, y: y + 1, color: 0x000000 })
        text({ ...base, y, color: 0xffffff })
      }
      // The code is read digit by digit off the screen, so space it out.
      label(card.code || '', -1, CODE_SIZE, 4)
      label(card.title || '', 1, NAME_SIZE)
    }

    button({ click_func, w: width, h: height, src: '_' })
  },

  onDestroy() {
    hmSetting.setBrightScreenCancel()
    hmSetting.setBrightness(brightness)
    hmSetting.setScreenAutoBright(isAutoBright)
    UI.reset()
  }
})
