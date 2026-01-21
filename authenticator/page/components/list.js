import { height, width, rect, text } from './../../../pages/ui.js'
import { Card } from './card.js'
import { getCode } from './../libs/totp.js'

let cardWidgets = []
let storedAccounts = []

const GAP = 20
const CARD_H = (height - GAP * 3) / 3 | 0
const CARD_W = width - 120
const CODE_FONT = height * 0.14 | 0
const STEP = CARD_H + GAP

const DIMS = {
  cardsPerPage: 3,
  card: {
    x: (width - CARD_W) / 2 | 0,
    y: GAP,
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

export const List = (accounts = [], placeholderCode = null) => {
  if (accounts.length === 0) {
    const { y, step } = DIMS.card
    Card({ name: 'No accounts. Open phone settings to add accounts.' }, '240 891', y + step, 0, DIMS)
    text({
      text: 'No accounts.\nOpen phone settings\nto add accounts.',
      text_size: 30,
      color: 0x888888,
      y: height / -3
    })
    return
  }

  storedAccounts = accounts
  const { y, step } = DIMS.card
  const n = accounts.length
  const visible = Math.min(4, n)

  const createCards = (from, to) => {
    for (let i = from; i < to; i++) {
      cardWidgets.push(Card(accounts[i], null, y + (i + 1) * step, i, DIMS))
    }
  }

  const fillCodes = (from, to) => {
    for (let i = from; i < to; i++) {
      cardWidgets[i].update({ code: placeholderCode || getCode(accounts[i]) })
    }
  }

  const placeholder = (yPos) => rect({ x: 0, y: yPos, w: 1, h: step, color: 0x000000, centered: false })

  placeholder(0)
  createCards(0, visible)

  setTimeout(() => {
    fillCodes(0, visible)
    setTimeout(() => {
      createCards(visible, n)
      placeholder(y + (n + 1) * step)
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
