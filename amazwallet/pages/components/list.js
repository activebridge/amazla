import { height, width, screenShape, text } from './../../../pages/ui.js'
import { Card } from './card.js'
import { Heart } from './heart.js'

let cardWidgets = []

// Heart footprint (two stacked halves in heart.js: 64 + 80), same as authenticator.
export const HEART_H = 144
export const GAP = 20
const CARD_H = (height - GAP * 3) / 3 | 0
// Round screens (screenShape === 1) clip the edges, so they need a wider margin.
// Narrow screens (Band 7, 194px) have no room for margins — the floor makes the
// card take the whole width there and leaves every wider device untouched.
const MIN_CARD_W = 194
const CARD_W = Math.max(width - (screenShape === 1 ? 120 : 60), MIN_CARD_W)
export const STEP = CARD_H + GAP

export const DIMS = {
  cardsPerPage: 3,
  card: {
    x: (width - CARD_W) / 2 | 0,
    // Exactly one step down, so the heart above it occupies page 0 and page 1
    // lands the first card at the top of the screen.
    y: STEP,
    w: CARD_W,
    h: CARD_H,
    radius: CARD_H * 0.2 | 0,
    step: STEP,
  },
  name: {
    y: CARD_H * 0.14 | 0,
    h: CARD_H * 0.4 | 0,
    text_size: CARD_H * 0.34 | 0,
  },
  code: {
    y: CARD_H * 0.56 | 0,
    h: CARD_H * 0.38 | 0,
    text_size: CARD_H * 0.2 | 0,
  },
}

export const List = (cards = [], onClick = () => {}, dims = DIMS) => {
  cardWidgets = []

  if (cards.length === 0) {
    text({
      text: 'No cards.\nOpen phone settings\nto add cards.',
      text_size: 30,
      color: 0x888888,
      y: height / -3,
    })
    return cardWidgets
  }

  const { y, step } = dims.card
  // Hearts hug the list from both ends: bottom of the top one meets the first
  // card, top of the bottom one sits a gap under the last.
  Heart(y - HEART_H)

  cards.forEach((card, i) => {
    cardWidgets.push(Card(card, y + i * step, i, dims, onClick))
  })

  Heart(y + cards.length * step)

  return cardWidgets
}
