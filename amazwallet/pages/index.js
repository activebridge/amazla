import { readFileSync, writeFileSync } from './../utils/fs'
import UI, {
  button,
  text,
  rect,
  circle,
  stroke,
} from "./../../pages/ui"

const { messageBuilder } = getApp()._options.globalData;

const COLORS = [0x4facfe, 0xf6d365, 0xd57eeb, 0xd4fc79, 0xfad0c4, 0xec008c, 0xda22ff, 0x86fde8, 0xD31027, 0x1488CC]
let isRunning = false
let widgets = []
let cards = []
let index = 0
let selected

const { width, height } = hmSetting?.getDeviceInfo()

const onClick = (i) => {
  const param = JSON.stringify({ ...cards[i], color: COLORS[Math.floor(i % 10)] })
  hmApp.gotoPage({ url: 'pages/card', param })
}

const onSpin = (key, deg) => {
  index = (deg > 0) ? index - 1 : index + 1
  if (index > cards.length) index = 1
  if (index < 1) index = cards.length

  const y = index * height / 2 - 156

  selected?.setProperty(hmUI.prop.MORE, { y, color: 0xFFFFFF })
  hmUI.scrollToPage(Math.floor((index - 1) / 2), (index !== 1 && deg < 0) || (index !== cards.length && deg > 0))
  return true
}

const onKeyPress = (key, action) => {
  if (key === hmApp.key.BACK) return hmApp.goBack()
  if (key === hmApp.key.UP && action === hmApp.action.RELEASE) return onSpin(null, 1)
  if (key === hmApp.key.DOWN && action === hmApp.action.RELEASE) return onSpin(null, -1)
  if (key === hmApp.key.HOME) {
    onClick(index)
    return true
  }
  return false
}

Page({
  build() {
    hmUI.setStatusBarVisible(false)
    // cards = [{ title: 'First Card with long name', code: '0000000000000' }, {title: 'QR', qr: true, code: 'TEST'}]
    cards = readFileSync()
    // console.log(JSON.stringify(cards))
    const Cards = items => {
      UI.reset()
      selected = stroke({ line_width: 2, w: 210, h: 130, y: -100, radius: 15, color: 0x000000 })

      items.map((card, i) => {
        const y = i * height / 2 - 100
        const x = (i % 2 === 0) ? 70 : -90
        rect({ w: 196, h: 120, y: y, color: COLORS[Math.floor(i % 10)], radius: 15 })
        circle({ y: y, radius: 70, x: x, alpha: 35, color: 0x000000 })
        text({ w: 194, h: 120, y: y - 1, x: -1, text: card.title, text_size: 30, color: 0x000000 })
        text({ w: 194, h: 120, y: y, text: card.title, text_size: 30 })
        button({ src: 'btn', w: 196, h: 120, y: y - 10, click_func: () => { onClick(i) } })
        circle({ y: y - 44, radius: 10, x: -81, alpha: 255, color: 0x000000 })
      })
      hmUI.setScrollView(true, height, Math.floor((items.length + 1) / 2), true)
      hmUI.scrollToPage(Math.floor((items.length - 1) / 2) - 1, false)
      index = Math.floor((items.length + 1) / 2)
    }
    Cards(cards)

    const getCards = () => {
      messageBuilder.request({ method: 'GET_ACTIONS' }).then(({ result }) => {
        if (JSON.stringify(cards) === JSON.stringify(result)) return
        writeFileSync(result)
        Cards(result)
        cards = result
      }).catch((error) => {
        hmUI.showToast({ text: error || 'JS error' })
      })
    }
    getCards()

    hmApp.registerKeyEvent(onKeyPress)
    hmApp.registerSpinEvent(onSpin)
  },

  onDestroy() {
    UI.reset()
    hmApp.unregisterSpinEvent()
    hmApp.unregisterKeyEvent()
  }
})
