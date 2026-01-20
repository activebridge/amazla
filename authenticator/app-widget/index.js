import { getAppWidgetSize, setAppWidgetSize } from '@zos/ui'
import { text } from './../../pages/ui.js'
import { localStorage } from './../page/utils.js'
import { getCode, getTimeRemaining } from './../page/libs/totp.js'
import { Card } from './../page/components/card.js'

const { w } = getAppWidgetSize()
const CARD_H = 100
const CARD_W = w - 20

const DIMS = {
  card: { x: 10, w: CARD_W, h: CARD_H, radius: 16 },
  name: { y: 5, h: CARD_H * 0.35, text_size: 20 },
  digit: { y: CARD_H * 0.35, h: CARD_H * 0.6, text_size: 36 },
}

let cardWidget = null
let account = null
let timerInterval = null

AppWidget({
  onInit() {
    account = (localStorage.accounts || [])[0]
  },

  build() {
    setAppWidgetSize({ h: CARD_H + 20 })

    if (!account) {
      text({ text: 'No accounts', text_size: 20, color: 0x888888 })
      return
    }

    cardWidget = Card(account, getCode(account), 10, 0, DIMS)
    this.startTimer()
  },

  startTimer() {
    timerInterval = setInterval(() => {
      if (getTimeRemaining() === 30 && cardWidget) {
        cardWidget.update(getCode(account))
      }
    }, 1000)
  },

  onDestroy() {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
  },
})
