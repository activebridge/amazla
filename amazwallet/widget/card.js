import UI, { text, button, width, getAppWidgetSize, setAppWidgetSize } from './../../pages/ui.js'
import { readFileSync } from './../utils/fs'
import * as fs from './../shared/fs'
import { Card } from './../pages/components/card.js'

// Which card the widget is parked on, kept across launches. Its own file — the
// card list file is written by the phone sync and must not be touched here.
const INDEX_FILE = 'fs_widget_index.txt'
// Gap between a chevron and the card's edge. Everything laid out beside them —
// tap zones, the name plate, the card's own tap area — is measured off it.
const EDGE = 4
const APP_ID = 1039890

let cards = []
let index = 0
let card = null
let indexDirty = false

const readIndex = () => {
  const n = parseInt(fs.readFileSync(INDEX_FILE) || '0', 10)
  return isNaN(n) ? 0 : n
}

const writeIndex = (i) => fs.writeFileSync(INDEX_FILE, String(i))

// A card written by the phone always carries a code; the empty placeholder the
// card file defaults to does not.
const load = () => (readFileSync() || []).filter((c) => c && c.code)

AppWidget({
  onInit() {
    cards = load()
    index = readIndex()
    if (index >= cards.length || index < 0) index = 0
  },

  build() {
    // getAppWidgetSize() reports the real slot on hardware (w = content width,
    // margin = inset); the fallback keeps a 20px gutter each side.
    const sz = getAppWidgetSize() || {}
    const w = sz.w || width - 40
    const margin = sz.margin || ((width - w) / 2) | 0
    // Capped to a card's proportions. The slot height the OS reports can be much
    // taller than a card (and is unstable on some devices), and everything the
    // card component sizes off h — the engraved dot at h * 0.11 above all — grows
    // with it.
    const h = Math.min(sz.h || ((w * 0.33) | 0), (w * 0.33) | 0)
    setAppWidgetSize({ h })

    if (!cards.length) {
      // Ask for a short slot so the widget chrome underneath stays reachable.
      setAppWidgetSize({ h: 56 })
      text({
        x: 0, y: 0, w: width, h: 56,
        text: 'No cards', text_size: 20, color: 0x888888, centered: false,
      })
      return
    }

    // The card sits 3px in so its own drop shadow (drawn at y + 3) stays inside
    // the slot.
    const cardH = h - 6
    // Chevron box, the authenticator's sizing (half the box is glyph, so it runs
    // at 2x its font, capped against the width) and then 2x on top. Capped again
    // against the card height: the glyph is about half its box, so a box over
    // ~2x the card spills ink past the top and bottom edges.
    const chev = Math.min((Math.min(cardH * 0.48, w * 0.18) | 0) * 4, (cardH * 1.5) | 0)
    const cardRadius = (cardH * 0.2) | 0
    const boxH = (cardH * 0.42) | 0
    const dims = {
      card: { x: margin, w, h: cardH, radius: cardRadius },
      // No keyring dot here — it sits where the left chevron goes.
      dot: false,
      name: {
        text_size: Math.min(cardH * 0.34, w * 0.14) | 0,
        // The authenticator's inset name plate, but inset to sit between the
        // chevrons rather than spanning the card. Only about a third of a
        // chevron's box is glyph — it runs at 3x its font, pinned to the outer
        // edge — so that is all the plate has to clear.
        box: {
          y: ((cardH - boxH) / 2) | 0,
          h: boxH,
          radius: cardRadius,
          inset: cards.length > 1 ? ((chev * 0.34) | 0) + EDGE - 10 : 10,
        },
      },
    }
    // Fixed layout index: in the list, `i` alternates the dot corner and mirrors
    // the gradient, but here the same widgets are reused for every card, so the
    // layout has to stay put while only the colour and name change.
    card = Card(cards[index], 3, 0, dims, () => this.openCard())

    if (cards.length > 1) {
      this.chevrons(margin, w, h, chev)

      // The card's own tap layer is created inside Card(), so the chevron text
      // widgets land on top of it and eat every tap. Re-lay the card target over
      // them, spanning the gap between the two chevron hit zones.
      const gap = ((chev * 0.34) | 0) + EDGE
      button({
        x: margin + gap, y: 3, w: w - gap * 2, h: cardH, radius: 0,
        src: 'clear', centered: false,
        click_func: () => this.openCard(),
      })
    }
  },

  chevrons(margin, w, h, size) {
    // Box centred on the card (the card is inset 3px top and bottom, so its
    // centre is the slot's centre), then lifted: the glyph sits low in its box,
    // so box-centring leaves it under the card's centre line.
    const y = (((h - size) / 2) | 0) - 15
    const left = margin + EDGE
    const right = margin + w - size - EDGE

    // Engraved the way the card's decorative dot is: a light edge peeking out
    // from under a black glyph, so the chevrons read as punched into the card
    // rather than printed on it.
    const chev = (glyph, x, align) => {
      const layer = (dy, color) =>
        text({
          x, y: y + dy, w: size, h: size,
          text: glyph, text_size: size, color, align_h: align, centered: false,
        })
      layer(2, 0xcecece)
      layer(0, 0x000000)
    }

    chev('‹', left, 0)
    chev('›', right, 2)

    // Tap targets last, so they sit above the card's own click layer. Full-height
    // strips from the card's edge to where the name plate starts: a target sized
    // to the glyph left the corners beside it dead, and the whole side of the
    // card reads as "the arrow" anyway.
    const hitW = ((size * 0.34) | 0) + EDGE
    button({
      x: margin, y: 3, w: hitW, h: h - 6, radius: 0, src: 'clear', centered: false,
      click_func: () => this.cycle(-1),
    })
    button({
      x: margin + w - hitW, y: 3, w: hitW, h: h - 6, radius: 0, src: 'clear', centered: false,
      click_func: () => this.cycle(1),
    })
  },

  // Repoint the existing widgets at another card. Rebuilding is not an option:
  // hmUI.createWidget returns undefined outside build() in an AppWidget, and the
  // ui.js layer then throws attaching .set to it.
  show(i) {
    if (!card || !cards.length) return
    index = i
    const c = cards[index]
    card.update({
      title: c.title || '',
      color: c.color != null ? c.color : 0x3a3a3a,
    })
  },

  // The position is only worth keeping across launches, so it is flushed when
  // the widget goes away rather than on every tap — a chevron press was costing
  // an open/write/close each time.
  cycle(dir) {
    if (!cards.length) return
    this.show((index + dir + cards.length) % cards.length)
    indexDirty = true
  },

  flushIndex() {
    if (!indexDirty) return
    indexDirty = false
    writeIndex(index)
  },

  openCard() {
    this.flushIndex()
    hmApp.startApp({
      appid: APP_ID,
      url: 'pages/card',
      param: JSON.stringify(cards[index]),
      native: false,
    })
  },

  onResume() {
    // The phone may have synced while the widget was off screen. Same rule as
    // cycle(): repoint the widgets, never recreate them. A list that grew from
    // empty can only be picked up on the next build.
    const fresh = load()
    if (JSON.stringify(fresh) === JSON.stringify(cards)) return
    cards = fresh
    if (!cards.length) {
      if (card) card.update({ title: 'No cards', color: 0x3a3a3a })
      return
    }
    this.show(index < cards.length ? index : 0)
  },

  onPause() {
    this.flushIndex()
  },

  onDestroy() {
    this.flushIndex()
    UI.reset()
  },
})
