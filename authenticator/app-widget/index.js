import { text, button, img, rect, width, push, getAppWidgetSize, setAppWidgetSize } from './../../pages/ui.js'
import { localStorage } from './../page/utils.js'
import { getCode, getTimeRemaining } from './../page/libs/totp.js'
import { Card } from './../page/components/card.js'
import { DIMS as APP_DIMS } from './../page/components/list.js'
import { createTimer } from './../shared/timer.js'

// Widget geometry isn't available at module-eval under @zos (getAppWidgetSize()
// returns undefined there); it's resolved in build(), so these are filled then.
let CARD_H = 140
let CARD_W = width
let margin = 0
let DIMS = null

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
    // getAppWidgetSize() reports the real slot on hardware (e.g. GTR4:
    // {w:388,h:233,margin:39}) — w is the content width, margin the inset. The card
    // fills that width edge to edge, like amazwallet's widget does, so the two sit
    // flush when they're stacked on the same watchface.
    const sz = getAppWidgetSize() || {}
    CARD_W = sz.w || (width - 40)
    margin = sz.margin != null ? sz.margin : ((width - CARD_W) / 2 | 0)

    // Height comes from the in-app card (page/components/list.js DIMS) instead of
    // the slot: the OS offers a half-screen band (T-Rex 3 240px, GTR 4 233) that is
    // far taller than a card, so we ask for a card-tall slot and leave the rest to
    // the system chrome. Taking the app's height also gives the app's type sizes and
    // box positions for free, so the widget reads as one of the list's cards.
    // NOT clamped to sz.h: it's already shorter everywhere except Balance 2, which
    // reports a short 132 slot (not the usual height/2) against a 140 card — and
    // DEVICES.md flags that device's reported slot as not matching hardware.
    CARD_H = APP_DIMS.card.h
    setAppWidgetSize({ h: CARD_H })

    // Title and digit boxes are the app card's, so they land in the same places;
    // only the horizontal extent follows the wider widget card.
    DIMS = {
      card: { x: margin, w: CARD_W, h: CARD_H, radius: sz.radius || APP_DIMS.card.radius },
      name: { ...APP_DIMS.name },
      digit: { ...APP_DIMS.digit, w: CARD_W },
    }
    const codeFont = DIMS.digit.text_size

    if (!accounts.length) {
      // No card: request a minimal slot so the system widget chrome below us
      // (the settings gear) stays tappable instead of being covered by a tall
      // reserved slot.
      const emptyH = 56
      setAppWidgetSize({ h: emptyH })
      text({ x: 0, y: 0, w: width, h: emptyH, text: 'No accounts', text_size: 20, color: 0x888888, centered: false })
      return
    }

    const account = getAccount()
    card = Card(account, getCode(account), 0, index, DIMS)

    // Chevrons: the '‹'/'›' glyph fills less of its em box than a digit, so use
    // ~1.5x the digit font to match the digit height, pinned to the card edges.
    const chev = (codeFont * 2) | 0
    // Center the chevron box on the digit box (chevY = digit.y + (digit.h-chev)/2),
    // then nudge UP: the '‹'/'›' glyph (system font) sits low in its 2x em box
    // relative to the Jua digits, so equal box-centers leave it below the digit
    // line. The correction is a fraction of the DIGIT box so it scales with the
    // font across devices. 0.15 validated on T-Rex 3.
    const chevY = DIMS.digit.y + ((DIMS.digit.h - chev) / 2 | 0) - (DIMS.digit.h * 0.15 | 0)
    const leftChevX = margin + 14
    const rightChevX = margin + CARD_W - chev - 14

    // Left chevron (3 layers for a beveled look), edge-aligned
    const leftChev = (dy, color) =>
      text({ x: leftChevX, y: chevY + dy, w: chev, h: chev, text: '‹', text_size: chev, color, align_h: 0, centered: false })
    leftChev(-2, 0xcecece); leftChev(2, 0x000000); leftChev(0, 0x888888)
    button({ x: leftChevX, y: chevY, w: chev, h: chev, radius: 0, src: 'black', centered: false, click_func: () => this.cycleAccount(-1) })

    // Right chevron, edge-aligned
    const rightChev = (dy, color) =>
      text({ x: rightChevX, y: chevY + dy, w: chev, h: chev, text: '›', text_size: chev, color, align_h: 2, centered: false })
    rightChev(-2, 0xcecece); rightChev(2, 0x000000); rightChev(0, 0x888888)
    button({ x: rightChevX, y: chevY, w: chev, h: chev, radius: 0, src: 'black', centered: false, click_func: () => this.cycleAccount(1) })

    // Card click area (between the chevrons) - opens app with selected account
    button({
      x: margin + chev, y: 0, w: CARD_W - chev * 2, h: CARD_H,
      src: 'black',
      centered: false,
      click_func: () => this.openApp(),
    })

    // Progress bar
    const barInset = CARD_W * 0.15 | 0
    const barX = margin + barInset
    const barW = CARD_W - barInset * 2
    img({ src: 'gradient_bar.png', x: barX, y: 0, w: barW, h: 5, auto_scale: true, centered: false })
    cover = rect({ x: barX + barW, y: 0, w: 0, h: 5, color: 0x3a3a3a, centered: false })
  },

  openApp() {
    push({ url: 'page/index' })
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
    const barInset = CARD_W * 0.15 | 0
    const barW = CARD_W - barInset * 2
    const progress = (remaining / 30) * barW
    cover.set({
      centered: false,
      x: (margin + barInset + progress) | 0,
      y: 0,
      w: (barW - progress + 10) | 0,
      h: 5,
      color: 0x3a3a3a,
    })
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
