import UI, { text, rect, img, button, width, height } from './../../pages/ui.js'
import { readFileSync } from './../utils/fs'
import * as fs from './../shared/fs'
import { Code } from './../pages/components/code.js'

// The card page, one swipe from the watch face: the same background, the same
// scannable code, plus a chevron above and below to walk the wallet. Tapping the
// code opens the real card page (max brightness, screen kept on).
//
// Which card the widget is parked on, kept across launches. Its own file — the
// app widget keeps its own position, and the card list file is written by the
// phone sync and must not be touched here.
const INDEX_FILE = 'fs_secondary_index.txt'
const APP_ID = 1039890

// Vertical siblings of the app widget's '‹' / '›'. If a device ever draws these
// as tofu, '⌃' / '⌄' and '▲' / '▼' are the fallbacks worth trying.
const UP = '︿'
const DOWN = '﹀'
const CHEV = Math.min(76, (height * 0.17) | 0) // glyph size
const PAD = 10 // screen edge to the ink
// Neither glyph fills its text box, and the two don't sit the same way inside it
// ('︿' draws low, '﹀' high), so the boxes are offset by where the ink actually
// lands — measured off a device screenshot as a fraction of the font size, top
// of the box to the ink's leading ('︿') / trailing ('﹀') edge. Retune these two
// if a device's font draws the glyphs elsewhere in the box.
const UP_INK = 0.55
const DOWN_INK = 0.51
// What the chevrons take off each end: their ink, its padding, and a gap before
// the code. Everything else — the code, its labels, the tap zones — follows.
const BAND = PAD + ((CHEV * DOWN_INK) | 0) + 8

let cards = []
let index = 0
let indexDirty = false
let loaded = false

const readIndex = () => {
  const n = parseInt(fs.readFileSync(INDEX_FILE) || '0', 10)
  return isNaN(n) ? 0 : n
}

const writeIndex = (i) => fs.writeFileSync(INDEX_FILE, String(i))

// The position is only worth keeping across launches, so it is flushed when the
// widget goes away rather than on every tap.
const flushIndex = () => {
  if (!indexDirty) return
  indexDirty = false
  writeIndex(index)
}

// A card written by the phone always carries a code; the empty placeholder the
// card file defaults to does not.
const load = () => (readFileSync() || []).filter((c) => c && c.code)

// Same two lines as the card page (card color under the list's gradient).
const background = (color) => {
  const c = { centered: false, x: 0, y: 0, w: width, h: height }
  rect({ ...c, color: color != null ? color : 0x3a3a3a })
  img({ ...c, src: 'gradient_flip.png' })
}

// Engraved the way the card's decorative dot is: a light edge peeking out from
// under a black glyph, so the chevrons read as punched into the card rather than
// printed on it.
const chevron = (glyph, y) => {
  const layer = (dy, color) =>
    text({
      centered: false, x: 0, y: y + dy, w: width, h: CHEV,
      text: glyph, text_size: CHEV, color,
    })
  layer(2, 0xcecece)
  layer(0, 0x000000)
}

const openCard = () => {
  flushIndex()
  hmApp.startApp({
    appid: APP_ID,
    url: 'pages/card',
    param: JSON.stringify(cards[index]),
    native: false,
  })
}

const cycle = (dir) => {
  if (cards.length < 2) return
  index = (index + dir + cards.length) % cards.length
  indexDirty = true
  render()
}

// Unlike the app widget, this one redraws from scratch: a barcode is a different
// number of bars per card, so there is nothing to repoint.
const render = () => {
  UI.reset()

  if (!cards.length) {
    rect({ centered: false, x: 0, y: 0, w: width, h: height, color: 0x000000 })
    text({ text: 'No cards.\nOpen phone settings\nto add cards.', text_size: 30, color: 0x888888 })
    return
  }

  const card = cards[index]
  background(card.color)

  // A single card has nothing to cycle through, so it gets the whole screen.
  const band = cards.length > 1 ? BAND : 0
  const area = { x: 0, y: band, w: width, h: height - band * 2 }
  Code(card, area)
  button({
    centered: false, x: area.x, y: area.y, w: area.w, h: area.h,
    radius: 0, src: 'clear', click_func: openCard,
  })

  if (band) {
    // Boxes placed so the ink itself, not the box, ends up PAD from the edge.
    chevron(UP, PAD - ((CHEV * UP_INK) | 0))
    chevron(DOWN, height - PAD - ((CHEV * DOWN_INK) | 0))
    // Tap targets last, above the glyphs — the text widgets would otherwise eat
    // the tap. Full-width bands: the whole end of the screen reads as "the arrow".
    button({
      centered: false, x: 0, y: 0, w: width, h: band,
      radius: 0, src: 'clear', click_func: () => cycle(-1),
    })
    button({
      centered: false, x: 0, y: height - band, w: width, h: band,
      radius: 0, src: 'clear', click_func: () => cycle(1),
    })
  }
}

// Called from both onInit and build: a v1 host may only ever call build(), and
// an empty `cards` there would draw the "No cards" screen over a full wallet.
const init = () => {
  if (loaded) return
  loaded = true
  cards = load()
  index = readIndex()
  if (index >= cards.length || index < 0) index = 0
}

SecondaryWidget({
  onInit: init,

  build() {
    init()
    render()
  },

  onResume() {
    // The phone may have synced while the widget was off screen.
    const fresh = load()
    if (JSON.stringify(fresh) === JSON.stringify(cards)) return
    cards = fresh
    if (index >= cards.length) index = 0
    render()
  },

  onPause() {
    flushIndex()
  },

  onDestroy() {
    flushIndex()
    UI.reset()
  },
})
