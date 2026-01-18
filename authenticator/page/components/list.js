import { height, width, rect, scrollBar } from './../../../pages/ui.js'
import { Card } from './card.js'
import { generateTOTP, formatCode } from './../libs/totp.js'

let cardWidgets = []
let storedAccounts = []

const getCode = (acc) => formatCode(generateTOTP(acc.secret, acc.digits || 6))

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

export const List = (accounts = []) => {
  if (accounts.length === 0) return

  storedAccounts = accounts
  const { y, step } = DIMS.card
  const n = accounts.length

  // if (n > 3) scrollBar()

  // Top placeholder (invisible card)
  rect({ x: 0, y: 0, w: 1, h: step, color: 0x000000, centered: false })

  const visible = Math.min(3, n)
  const make = (i, yPos) => Card(accounts[i], null, yPos, i, DIMS)
  const code = (card, i) => card.update(getCode(accounts[i]))

  // Batch 1: first 3 visible cards
  for (let i = 0; i < visible; i++) {
    cardWidgets.push(make(i, y + (i + 1) * step))
  }

  setTimeout(() => {
    // Fill first 3 with codes
    for (let i = 0; i < visible; i++) code(cardWidgets[i], i)

    // Batch 2: remaining cards
    setTimeout(() => {
      for (let i = visible; i < n; i++) {
        cardWidgets.push(make(i, y + (i + 1) * step))
      }

      // Bottom placeholder (invisible card)
      rect({ x: 0, y: y + (n + 1) * step, w: 1, h: step, color: 0x000000, centered: false })

      setTimeout(() => {
        // Fill remaining with codes
        for (let i = visible; i < n; i++) code(cardWidgets[i], i)
      }, 100)
    }, 100)
  }, 100)
}

export const updateCodes = () => {
  const codes = storedAccounts.map(getCode)
  for (let i = 0; i < cardWidgets.length; i++) {
    cardWidgets[i].update(codes[i])
  }
}
