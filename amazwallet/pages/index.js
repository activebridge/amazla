import { readFileSync, writeFileSync } from './../utils/fs'
import UI from './../../pages/ui'
import { height } from './../../pages/ui.js'
import { List, DIMS, HEART_H, GAP } from './components/list.js'
import { Background } from './components/background.js'

const { messageBuilder } = getApp()._options.globalData

let cards = []

const onClick = (i) => {
  hmApp.gotoPage({ url: 'pages/card', param: JSON.stringify(cards[i]) })
}

const render = () => {
  UI.reset()
  if (cards.length === 0) {
    List(cards, onClick)
    return
  }
  const { step, y } = DIMS.card
  // Top heart (already inside `y`) + cards + bottom heart + a closing gap.
  const content = y + cards.length * step + HEART_H + GAP
  // Enough snap pages to reach the end of that content...
  const pages = Math.max(1, Math.ceil((content - height) / step) + 1)
  // ...and a background tall enough for every one of them, or it cuts off mid-scroll.
  Background(Math.max(content, (pages - 1) * step + height))
  List(cards, onClick)
  hmUI.setScrollView(true, step, pages, true)
  // Page 0 is the heart; open on the first card, with the heart a swipe above.
  hmUI.scrollToPage(Math.min(1, pages - 1), false)
}

const onKeyPress = (key) => {
  if (key === hmApp.key.BACK) return hmApp.goBack()
  return false
}

Page({
  build() {
    hmUI.setStatusBarVisible(false)

    cards = readFileSync() || []
    render()

    messageBuilder
      .request({ method: 'GET_ACTIONS' })
      .then(({ result }) => {
        if (!result || JSON.stringify(cards) === JSON.stringify(result)) return
        writeFileSync(result)
        cards = result
        render()
      })
      .catch((error) => {
        hmUI.showToast({ text: error || 'JS error' })
      })

    hmApp.registerKeyEvent(onKeyPress)
  },

  onDestroy() {
    UI.reset()
    hmApp.unregisterKeyEvent()
  },
})
