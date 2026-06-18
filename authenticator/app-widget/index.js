import { push } from '@zos/router'
import { text, button, img, rect, width, prop, getAppWidgetSize, setAppWidgetSize } from './../../pages/ui.js'
import { localStorage } from './../page/utils.js'
import { getCode, getTimeRemaining } from './../page/libs/totp.js'
import { Card } from './../page/components/card.js'
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
    // Card width = slot width (OS-reported, else device width) minus a 20px
    // gutter each side; the card is then centered. (getAppWidgetSize() reports
    // the full slot width here, so we always inset it ourselves.)
    // getAppWidgetSize() gives the real slot on hardware (e.g. GTR4:
    // {w:388,h:114,margin:39}) — w is the content width, margin the inset.
    // Use them directly; fall back only when absent.
    const sz = getAppWidgetSize() || {}
    CARD_W = sz.w || (width - 40)
    margin = sz.margin || ((width - CARD_W) / 2 | 0)
    CARD_H = sz.h || (CARD_W * 0.33 | 0)
    setAppWidgetSize({ h: CARD_H })

    // Content sized off CARD_H to match the in-app card (list.js), but capped to
    // the width so an unstable/tall slot (GTR4 reported sz.h up to 233) can't blow
    // the font up to 111px and make the chevrons overlap the digits.
    const codeFont = Math.min(CARD_H * 0.48, CARD_W * 0.18) | 0
    const titleFont = Math.min(CARD_H * 0.28, CARD_W * 0.12) | 0

    // Title stays where it is (top). Center the digits in the space BELOW it, so
    // on a tall slot they sit mid-area instead of pinned high. On flat cards this
    // resolves to the same position as before.
    // Top padding = the title's 10px horizontal inset (pill draws at y+2), so the
    // gap above the pill matches the gap on its sides.
    const nameY = 8
    const nameH = (CARD_H * 0.35 | 0) + 10
    const digitH = codeFont + 20
    const digitY = ((nameY + nameH + CARD_H) / 2 - digitH / 2) | 0

    DIMS = {
      card: { x: margin, w: CARD_W, h: CARD_H, radius: sz.radius || (CARD_H * 0.2 | 0) },
      name: { y: nameY, h: nameH, text_size: titleFont, radius: sz.radius },
      digit: { y: digitY, w: CARD_W, h: digitH, text_size: codeFont },
    }

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
    const barInset = CARD_W * 0.15 | 0
    const barW = CARD_W - barInset * 2
    const progress = (remaining / 30) * barW
    cover.setProperty(prop.X, (margin + barInset + progress) | 0)
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
