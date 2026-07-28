import UI, { button, rect, img, width, height } from './../../pages/ui'
import { Code } from './components/code.js'

let card = {}
let brightness, isAutoBright = false

// Card color plus the same gradient overlay the list cards use.
const background = (color) => {
  const c = { centered: false, x: 0, y: 0, w: width, h: height }
  rect({ ...c, color: color != null ? color : 0x3a3a3a })
  img({ ...c, src: 'gradient_flip.png' })
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

    background(card.color)
    // The whole screen is the code's: this page exists to be held under a scanner.
    Code(card, { x: 0, y: 0, w: width, h: height })

    button({ click_func, w: width, h: height, src: '_' })
  },

  onDestroy() {
    hmSetting.setBrightScreenCancel()
    hmSetting.setBrightness(brightness)
    hmSetting.setScreenAutoBright(isAutoBright)
    UI.reset()
  }
})
