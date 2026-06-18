import { prop } from '@zos/ui'
import { text, rect, img, width, height } from './../../pages/ui.js'
import { getCode } from './../page/libs/totp.js'
import { Card } from './../page/components/card.js'

const MARGIN = 10
const GAP = 20
const TIMER_H = 35
const CARD_W = (width - MARGIN * 2 - GAP) / 2 | 0
const CARD_H = (height - MARGIN * 2 - GAP * 3 - TIMER_H) / 3 | 0

const NAME_SIZE = 22
// Scale the code to the (narrow, 2-column) card width so 6 digits fit in the
// column instead of overflowing into the next one. ~0.21*(usable half-pair width).
const CODE_SIZE = (CARD_W - 20) * 0.27 | 0

// Positions relative to CARD_H so the title + code both stay inside the card
// (fixed y/h were taller than the card on small screens -> digits spilled below).
const DIMS = {
  card: { x: 0, w: CARD_W, h: CARD_H, radius: 20 },
  name: { y: CARD_H * 0.1 | 0, h: CARD_H * 0.42 | 0, text_size: NAME_SIZE },
  digit: { y: (CARD_H * 0.52 | 0) + 5, w: CARD_W, h: CARD_H * 0.45 | 0, text_size: CODE_SIZE, gap: 4 },
}

let cards = []
let accounts = []

export const refreshCodes = () => {
  cards.forEach((card, i) => {
    card.update({ code: getCode(accounts[i]) })
  })
}

export const updateAccounts = (newAccounts) => {
  accounts = newAccounts
  cards.forEach((card, i) => {
    const acc = accounts[i]
    if (acc) {
      card.update({ title: acc.issuer || acc.name, code: getCode(acc), colorIndex: i })
    }
  })
}

export const Layout = (accs) => {
  cards = []
  accounts = accs.slice(0, 6)

  if (accounts.length === 0) {
    text({ text: 'No accounts', text_size: 30, color: 0x888888 })
    return {}
  }

  // Create 2x3 grid of cards, centered vertically
  const numRows = Math.ceil(accounts.length / 2)
  const totalH = height - MARGIN * 2 - TIMER_H
  const usedH = numRows * CARD_H + (numRows - 1) * GAP
  const offsetY = (totalH - usedH) / 2 | 0

  accounts.forEach((acc, i) => {
    const col = i % 2
    const row = (i / 2) | 0
    const x = MARGIN + col * (CARD_W + GAP)
    const y = MARGIN + offsetY + row * (CARD_H + GAP)

    const dims = { ...DIMS, card: { ...DIMS.card, x } }
    const card = Card(acc, getCode(acc), y, i, dims)
    cards.push(card)
  })

  // Timer bar at bottom
  const barY = height - MARGIN - TIMER_H / 2 | 0
  const barX = MARGIN + 20
  const barW = width - MARGIN * 2 - 40

  img({ src: 'gradient_bar.png', x: barX, y: barY, w: barW, h: 5, auto_scale: true, centered: false })
  const cover = rect({ x: barX + barW, y: barY, w: 0, h: 5, color: 0x000000, centered: false })

  return {
    updateTimer: (remaining) => {
      const progress = (remaining / 30) * barW
      cover.setProperty(prop.X, (barX + progress) | 0)
      cover.setProperty(prop.W, (barW - progress + 10) | 0)
    }
  }
}
