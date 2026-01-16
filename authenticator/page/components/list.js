import { height, width } from './../../../pages/ui.js'
import { Card } from './card.js'

let cardWidgets = []

const GAP = 20
const CARD_H = (height - GAP * 3) / 3 | 0
const CARD_W = width - 100
const CODE_FONT = CARD_H * 0.5 | 0
const DIGIT_W = CODE_FONT * 0.7 | 0
const SPACE_W = CODE_FONT * 0.1 | 0
const DIGITS_START = -(6 * DIGIT_W + SPACE_W) / 2 | 0

const DIMS = {
  cardsPerPage: 3,
  digitsPerCard: 6,
  card: {
    x: (width - CARD_W) / 2 | 0,
    y: GAP,
    w: CARD_W,
    h: CARD_H,
    radius: CARD_H * 0.2 | 0,
    step: CARD_H + GAP,
  },
  name: {
    y: CARD_H * 0.08 | 0,
    h: CARD_H * 0.35 | 0,
    text_size: CARD_H * 0.28 | 0,
  },
  digit: {
    y: (CARD_H * 0.45 | 0) - 20,
    w: DIGIT_W,
    h: CARD_H * 0.65 | 0,
    text_size: CODE_FONT,
    offsets: [
      DIGITS_START,
      DIGITS_START + DIGIT_W,
      DIGITS_START + DIGIT_W * 2,
      DIGITS_START + DIGIT_W * 3 + SPACE_W,
      DIGITS_START + DIGIT_W * 4 + SPACE_W,
      DIGITS_START + DIGIT_W * 5 + SPACE_W,
    ],
  },
}

export const List = (accounts = []) => {
  const { y, step } = DIMS.card
  const { cardsPerPage, digitsPerCard } = DIMS
  const visible = Math.min(cardsPerPage, accounts.length)
  let i = 0

  const render = () => {
    const end = i < visible ? visible : accounts.length
    for (; i < end; i++) {
      const card = Card(accounts[i], y + i * step, (i % cardsPerPage) * digitsPerCard, DIMS)
      setTimeout(card.update, 200)
      cardWidgets.push(card)
    }
  }

  render()
  if (visible < accounts.length) setTimeout(render, 500)
}

export const updateCodes = () => {
  for (let i = 0; i < cardWidgets.length; i++) {
    cardWidgets[i].update()
  }
}
