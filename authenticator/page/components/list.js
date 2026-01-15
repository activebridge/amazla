import * as hmUI from '@zos/ui'
import { width, height } from './../../../pages/ui.js'
import { generateTOTP, formatCode } from './../libs/totp.js'

// Calculate inscribed square for round screen
const diameter = Math.min(width, height)
const squareSide = Math.floor(diameter * 0.707)
const offset = Math.floor((diameter - squareSide) / 2)

// Vertical padding for top/bottom
const VERTICAL_PADDING = Math.floor(squareSide * 0.04)

// Calculate dimensions to fit 3 cards on screen (accounting for padding)
const ITEM_SPACE = Math.floor(squareSide * 0.04)
const availableHeight = squareSide - 2 * VERTICAL_PADDING
const ITEM_HEIGHT = Math.floor((availableHeight - 2 * ITEM_SPACE) / 3)

// Proportional sizing based on card height
const cardPadding = Math.floor(ITEM_HEIGHT * 0.15)
const nameFontSize = Math.floor(ITEM_HEIGHT * 0.28)
const codeFontSize = Math.floor(ITEM_HEIGHT * 0.55)
const radius = Math.floor(ITEM_HEIGHT * 0.2)

// Extended gradient colors from tabline (pink → orange → yellow-green)
const GRADIENT_COLORS = [
  0xf4468f, 0xf8488a, 0xfd4a85, 0xfe4d80, 0xff507a, 0xff5375, 0xff566f, 0xff5a69, 0xff5e63,
  0xff625d, 0xff6658, 0xff6b53, 0xff704e, 0xff7549, 0xff7a45, 0xff7f41, 0xff843d, 0xff8a3a,
  0xff9036, 0xf99533, 0xf89b31, 0xf3a130, 0xefa72f, 0xeaad2f, 0xe6b32e, 0xe1b92f, 0xdcbe30,
  0xd7c432, 0xd2c934, 0xcdcf37, 0xc8d43a, 0xc3d93e, 0xbfde43, 0xbae348, 0xb6e84e, 0xb0ec54,
  0xaff05b,
]

// Dark card background (visible at low brightness)
const CARD_BG = 0x2a2a2a

// Export for scroll snap
export const SNAP_HEIGHT = ITEM_HEIGHT + ITEM_SPACE

const VISIBLE_CARDS = 3
const DIGITS_PER_CARD = 6
const TOTAL_DIGITS = VISIBLE_CARDS * DIGITS_PER_CARD

// Get gradient color based on global position
const getDigitColor = (globalPosition) => {
  const position = globalPosition % TOTAL_DIGITS
  const ratio = position / Math.max(TOTAL_DIGITS - 1, 1)
  const gradientIndex = Math.floor(ratio * (GRADIENT_COLORS.length - 1))
  return GRADIENT_COLORS[Math.min(gradientIndex, GRADIENT_COLORS.length - 1)]
}

let cardWidgets = []
let totalAccounts = 0

// Calculate Y offset to center cards when fewer than 3
const getCardY = (cardIndex) => {
  const totalHeight = totalAccounts * ITEM_HEIGHT + (totalAccounts - 1) * ITEM_SPACE
  const startY = totalAccounts < VISIBLE_CARDS
    ? offset + Math.floor((squareSide - totalHeight) / 2)
    : offset + VERTICAL_PADDING
  return startY + cardIndex * (ITEM_HEIGHT + ITEM_SPACE)
}

// Create a single card
const createCard = (acc, cardIndex) => {
  const name = acc.issuer || acc.name
  const y = getCardY(cardIndex)
  const code = '------'

  const shadowDark = hmUI.createWidget(hmUI.widget.FILL_RECT, {
    x: offset + 3,
    y: y + 3,
    w: squareSide,
    h: ITEM_HEIGHT,
    radius,
    color: 0x151515,
  })

  const shadowLight = hmUI.createWidget(hmUI.widget.FILL_RECT, {
    x: offset - 2,
    y: y - 2,
    w: squareSide,
    h: ITEM_HEIGHT,
    radius,
    color: 0x404040,
  })

  const bg = hmUI.createWidget(hmUI.widget.FILL_RECT, {
    x: offset,
    y,
    w: squareSide,
    h: ITEM_HEIGHT,
    radius,
    color: CARD_BG,
  })

  const nameText = hmUI.createWidget(hmUI.widget.TEXT, {
    x: offset + cardPadding,
    y: y + Math.floor(ITEM_HEIGHT * 0.02),
    w: squareSide - cardPadding * 2,
    h: Math.floor(ITEM_HEIGHT * 0.35),
    text: name,
    text_size: nameFontSize,
    color: 0xffffff,
    align_h: hmUI.align.CENTER_H,
  })

  const digits = code.split('')
  const digitWidth = Math.floor(codeFontSize * 0.7)
  const spaceWidth = Math.floor(codeFontSize * 0.4)
  const totalWidth = digits.length * digitWidth + spaceWidth
  const startX = offset + Math.floor((squareSide - totalWidth) / 2)
  const codeY = y + Math.floor(ITEM_HEIGHT * 0.32)

  const digitWidgets = digits.map((digit, i) => {
    const globalPosition = cardIndex * DIGITS_PER_CARD + i
    const extraSpace = i >= 3 ? spaceWidth : 0
    const x = startX + i * digitWidth + extraSpace
    const h = Math.floor(ITEM_HEIGHT * 0.65)

    // Debossed effect: light shadow below-right, dark shadow above-left
    const shadowLight = hmUI.createWidget(hmUI.widget.TEXT, {
      x: x + 2,
      y: codeY + 2,
      w: digitWidth,
      h,
      text: digit,
      text_size: codeFontSize,
      color: 0x505050,
      align_h: hmUI.align.CENTER_H,
    })

    const shadowDark = hmUI.createWidget(hmUI.widget.TEXT, {
      x: x - 2,
      y: codeY - 2,
      w: digitWidth,
      h,
      text: digit,
      text_size: codeFontSize,
      color: 0x000000,
      align_h: hmUI.align.CENTER_H,
    })

    const main = hmUI.createWidget(hmUI.widget.TEXT, {
      x,
      y: codeY,
      w: digitWidth,
      h,
      text: digit,
      text_size: codeFontSize,
      color: getDigitColor(globalPosition),
      align_h: hmUI.align.CENTER_H,
    })

    return { shadowLight, shadowDark, main }
  })

  return { shadowDark, shadowLight, bg, nameText, digitWidgets, acc, y }
}

// Update code for a single card
const updateCardCode = (card) => {
  const code = formatCode(generateTOTP(card.acc.secret, card.acc.digits || 6))
  const digits = code.replace(' ', '').split('')

  card.digitWidgets.forEach((widget, i) => {
    if (digits[i]) {
      widget.shadowLight.setProperty(hmUI.prop.TEXT, digits[i])
      widget.shadowDark.setProperty(hmUI.prop.TEXT, digits[i])
      widget.main.setProperty(hmUI.prop.TEXT, digits[i])
    }
  })
}

export const createAccountList = (accounts = []) => {
  totalAccounts = accounts.length

  // Create first 3 cards synchronously (visible on screen)
  const initialCount = Math.min(VISIBLE_CARDS, accounts.length)
  for (let i = 0; i < initialCount; i++) {
    cardWidgets.push(createCard(accounts[i], i))
  }
}

// Create remaining cards and generate all codes async
export const generateCodesAsync = (accounts = [], onComplete) => {
  let cardIndex = VISIBLE_CARDS
  let codeIndex = 0

  const processNext = () => {
    // First: create remaining cards
    if (cardIndex < accounts.length) {
      cardWidgets.push(createCard(accounts[cardIndex], cardIndex))
      cardIndex++
      setTimeout(processNext, 5)
      return
    }

    // Then: generate codes for all cards
    if (codeIndex < cardWidgets.length) {
      updateCardCode(cardWidgets[codeIndex])
      codeIndex++
      setTimeout(processNext, 5)
      return
    }

    if (onComplete) onComplete()
  }

  setTimeout(processNext, 10)
}

export const updateAccountCodes = (accounts = []) => {
  if (cardWidgets.length === 0) return

  cardWidgets.forEach((card, index) => {
    if (accounts[index]) {
      updateCardCode(card)
    }
  })
}

export const destroyAccountList = () => {
  cardWidgets.forEach((card) => {
    hmUI.deleteWidget(card.shadowDark)
    hmUI.deleteWidget(card.shadowLight)
    hmUI.deleteWidget(card.bg)
    hmUI.deleteWidget(card.nameText)
    card.digitWidgets.forEach((w) => {
      hmUI.deleteWidget(w.shadowLight)
      hmUI.deleteWidget(w.shadowDark)
      hmUI.deleteWidget(w.main)
    })
  })
  cardWidgets = []
  totalAccounts = 0
}
