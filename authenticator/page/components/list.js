import { height, width, isRound, isV1, text } from './../../../pages/ui.js'
import { Card } from './card.js'
import { getCode } from './../libs/totp.js'
import { Heart } from './heart.js'

let cardWidgets = []
let storedAccounts = []

const GAP = 20
// Square API-1.0 watches keep the system status bar — it carries the countdown
// (page/components/timer.js). It takes space off the top, so it comes out of the
// height the three cards share, not just their starting offset, or the third card
// hangs off the bottom.
const BAR_H = isV1 && !isRound ? (width / 12 | 0) : 0
// Round screens clip the edges, so they need a wider margin. The floor is
// amazwallet's: the narrowest screens (Band 7, 194px) have no room for margins, so
// the card takes the whole width there, and every wider device is untouched.
const MIN_CARD_W = 194
const CARD_W = Math.max(width - (isRound ? 120 : 60), MIN_CARD_W)
// A card's drop shadow is drawn 3px BELOW it (page/components/card.js), and three
// cards fill the usable height exactly — so the third one's shadow lands on the
// screen edge and vanishes, leaving it looking cut off rather than stacked. Hand
// 5px back on the screens where it shows: the cramped ones at the width floor
// (Band 7), where every pixel of the card reaches the glass.
const SHADOW_PAD = CARD_W === MIN_CARD_W ? 5 : 0
// Three cards per screen: 3 * STEP == the height below the bar, less that padding.
const CARD_H = (height - BAR_H - GAP * 3 - SHADOW_PAD) / 3 | 0
// Sized off the height, but capped to what actually fits ACROSS the card: the code
// is two 3-digit halves either side of a gap, so a tall narrow screen (Band 7,
// 194px wide) would otherwise push the digits out past the card's edges. Same
// formula the square secondary-widget uses for its narrow columns.
const CODE_FONT = Math.min(height * 0.12, (CARD_W - 20) * 0.27) | 0
const HEART_H = 144 // heart footprint (two stacked halves in heart.js: 64 + 80)
export const STEP = CARD_H + GAP
// Where the content starts: below the bar where there is one, at the top otherwise.
export const TOP_OFFSET = BAR_H

export const DIMS = {
  cardsPerPage: 3,
  card: {
    x: (width - CARD_W) / 2 | 0,
    y: GAP + TOP_OFFSET,
    w: CARD_W,
    h: CARD_H,
    radius: CARD_H * 0.2 | 0,
    step: STEP,
  },
  name: {
    y: (CARD_H * 0.08 | 0) - 5,
    h: (CARD_H * 0.35 | 0) + 10,
    text_size: CARD_H * 0.28 | 0,
  },
  digit: {
    y: (CARD_H * 0.45 | 0) - 5,
    h: CARD_H * 0.65 | 0,
    text_size: CODE_FONT,
  },
}

export const List = (accounts = [], placeholderCode = null, dims = DIMS) => {
  cardWidgets = []

  if (accounts.length === 0) {
    const { x, y, w, step } = dims.card
    // The message takes the card's own box — same margins, same top offset — and
    // wraps to it, rather than a fixed 30px line that runs off a narrow screen and
    // under the status bar. It occupies the slot above the sample card.
    const msgSize = Math.min(dims.name.text_size, w * 0.1) | 0
    text({
      text: 'No accounts. Open phone settings to add accounts.',
      x, y, w, h: step - GAP,
      text_size: msgSize,
      text_style: 'wrap',
      color: 0x888888,
      centered: false,
    })
    // A sample card below it, so the empty app still reads as the app. Its title is
    // short on purpose: the pill is one line and clips, and it is NOT the message.
    Card({ name: 'No accounts' }, '240 891', y + step, 0, dims)
    return
  }

  storedAccounts = accounts
  const { y, step } = dims.card
  const n = accounts.length
  const visible = Math.min(4, n)

  const createCards = (from, to) => {
    for (let i = from; i < to; i++) {
      cardWidgets.push(Card(accounts[i], null, y + (i + 1) * step, i, dims))
    }
  }

  const fillCodes = (from, to) => {
    for (let i = from; i < to; i++) {
      cardWidgets[i].update({ code: placeholderCode || getCode(accounts[i]) })
    }
  }

  // Top heart hugs the first card from above (bottom of heart == first card top).
  Heart(y + step - HEART_H)
  createCards(0, visible)

  setTimeout(() => {
    fillCodes(0, visible)
    setTimeout(() => {
      createCards(visible, n)
      // Bottom heart hugs the last card from below (last card bottom).
      Heart(y + n * step + dims.card.h | 0)
      setTimeout(() => fillCodes(visible, n), 100)
    }, 100)
  }, 300)
}

export const updateCodes = () => {
  const codes = storedAccounts.map(getCode)
  for (let i = 0; i < cardWidgets.length; i++) {
    cardWidgets[i].update({ code: codes[i] })
  }
}
