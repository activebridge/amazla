import { encodeEAN13 } from './../utils/ean13'
import UI, {
  button,
  text,
  rect,
  circle
} from "./../../pages/ui"

let card = {}
let brightness, isAutoBriht = false

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
    // if (!card.code) return text({ text: "No Content" })
    if (card.qr) return qr(card)

    const lines = encodeEAN13(String(card.code || '').padStart(13, "0"))
    let w = 220
    let h = 410
    if (isLandscape) w = 410, h = 220
    rect({ color: card.color, bar: 0})
    isLandscape && text({ text: card.title, y: -150, color: 0x000000, text_size: 40 })
    isLandscape && text({ text: card.title, y: -151, color: 0xffffff, text_size: 40 })
    isLandscape && text({ text: card.code, y: 150, color: 0x000000, text_size: 30 })
    isLandscape && text({ text: card.code, y: 151, color: 0xffffff, text_size: 30 })
    rect({ color: 0xFFFFFF, h: h, w: w, radius: 20 })
    lines.map((l, i) => {
      let h = 3
      let w = 186
      let barHeight = h * 94
      let x = 0, y = i * h - barHeight/2 - 8
      if (isLandscape) w = 4, h = 186, x = i * w - 190, y = 0
      l === 1 && rect({ x, y, w, h, color: 0x000000 })
    })
    button({ click_func, w: width, h: height, src: '_' })
  },

  onDestroy() {
    hmSetting.setBrightScreenCancel()
    hmSetting.setBrightness(brightness)
    hmSetting.setScreenAutoBright(isAutoBriht)
    UI.reset()
  }
})
