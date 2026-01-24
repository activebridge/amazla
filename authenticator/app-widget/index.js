import { getAppWidgetSize, setAppWidgetSize, prop } from '@zos/ui'
import { push } from '@zos/router'
import { text, button, img, rect } from './../../pages/ui.js'
import { localStorage } from './../page/utils.js'
import { getCode, getTimeRemaining } from './../page/libs/totp.js'
import { Card } from './../page/components/card.js'
import { createTimer } from './../shared/timer.js'

const { w, margin = 0 } = getAppWidgetSize()
const CARD_H = 140
const CARD_W = w
const CODE_FONT = 67

const DIMS = {
  card: { x: margin, w: CARD_W, h: CARD_H, radius: CARD_H * 0.2 | 0 },
  name: { y: (CARD_H * 0.08 | 0) - 5, h: (CARD_H * 0.35 | 0) + 10, text_size: CARD_H * 0.28 | 0 },
  digit: { y: (CARD_H * 0.45 | 0) - 5, w: CARD_W, h: CODE_FONT + 20, text_size: CODE_FONT },
}

let card = null
let accounts = []
let index = 0
let timer = null
let cover = null

const getAccount = () => accounts[index]
const getName = (acc) => acc.issuer || acc.name

AppWidget({
  onInit() {
    accounts = localStorage.accounts || []
    index = localStorage.widgetIndex || 0
    if (index >= accounts.length) index = 0
  },

  build() {
    setAppWidgetSize({ h: CARD_H })

    if (!accounts.length) {
      text({ text: 'No accounts', text_size: 20, color: 0x888888 })
      return
    }

    const account = getAccount()
    card = Card(account, getCode(account), 0, index, DIMS)

    const textSize = 120
    const btnY = ((CARD_H - textSize) / 2 | 0) + 12
    const leftBtnX = margin - 10
    const rightBtnX = margin + CARD_W - textSize + 10

    // Left chevron with shadows
    text({ x: leftBtnX - 15, y: btnY + 8, w: textSize, h: textSize, text: '‹', text_size: textSize, color: 0xcecece, centered: false })
    text({ x: leftBtnX - 15, y: btnY + 12, w: textSize, h: textSize, text: '‹', text_size: textSize, color: 0x000000, centered: false })
    text({ x: leftBtnX - 15, y: btnY + 10, w: textSize, h: textSize, text: '‹', text_size: textSize, color: 0x888888, centered: false })

    button({
      x: leftBtnX, y: btnY, w: textSize, h: textSize, radius: 0,
      src: 'black',
      centered: false,
      click_func: () => this.cycleAccount(-1),
    })

    // Right chevron with shadows
    text({ x: rightBtnX + 15, y: btnY + 8, w: textSize, h: textSize, text: '›', text_size: textSize, color: 0xcecece, centered: false })
    text({ x: rightBtnX + 15, y: btnY + 12, w: textSize, h: textSize, text: '›', text_size: textSize, color: 0x000000, centered: false })
    text({ x: rightBtnX + 15, y: btnY + 10, w: textSize, h: textSize, text: '›', text_size: textSize, color: 0x888888, centered: false })

    button({
      x: rightBtnX, y: btnY, w: textSize, h: textSize, radius: 0,
      src: 'black',
      centered: false,
      click_func: () => this.cycleAccount(1),
    })

    // Card click area - opens app with selected account
    button({
      x: leftBtnX + textSize + 10, y: 0, w: CARD_W - textSize * 2, h: CARD_H,
      src: 'black',
      centered: false,
      click_func: () => this.openApp(),
    })

    // Progress bar
    const barX = margin + 35
    const barW = CARD_W - 70
    img({ src: 'gradient_bar.png', x: barX, y: 0, w: barW, h: 5, auto_scale: true, centered: false })
    cover = rect({ x: barX + barW, y: 0, w: 0, h: 5, color: 0x3a3a3a, centered: false })
  },

  openApp() {
    push({ url: 'page/index.page' })
  },

  onResume() {
    if (card) {
      card.update({ code: getCode(getAccount()) })
      this.updateProgress()
      this.startTimer()
    }
  },

  onPause() {
    if (timer) timer.stop()
  },

  cycleAccount(dir) {
    index = (index + dir + accounts.length) % accounts.length
    localStorage.widgetIndex = index
    const account = getAccount()
    card.update({ title: getName(account), code: getCode(account), colorIndex: index })
  },

  updateProgress() {
    if (!cover) return
    const remaining = getTimeRemaining()
    const barW = CARD_W - 70
    const progress = (remaining / 30) * barW
    cover.setProperty(prop.X, (margin + 35 + progress) | 0)
    cover.setProperty(prop.W, (barW - progress + 10) | 0)
  },

  startTimer() {
    timer = createTimer(
      () => this.updateProgress(),
      () => { if (card) card.update({ code: getCode(getAccount()) }) }
    )
    timer.start()
  },

  onDestroy() {
    if (timer) timer.stop()
  },
})
