import { getText } from '@zos/i18n'
import { height, text, width } from './../../../pages/ui.js'

// Round-screen connection status: a single curved-text label hugging the bottom
// of the bezel (6 o'clock), with the same arc typography as the battery
// component. Painted through pages/ui.js text() so it's tracked by UI.reset() —
// the page recreates it last on every render() (see the update() calls there), so
// it always lands on top of the car images and a live push never buries it.
// Loaded via the `[pf]` zosLoader; the square build gets status.s.layout.js
// instead, so there's no shape check here.
//
//   import Status from 'zosLoader:./components/status.[pf].layout.js'
//   const status = Status('checking')   // creates + paints the initial state
//   status.update('online')             // repaints the label

// Arc text sits just inside the bezel, centered on 6 o'clock. ZeppOS angles:
// 0° at the top, clockwise; on the bottom half mode 1 flips glyphs upright.
const RADIUS = height / 2 - 8
const TEXT_SIZE = 26
const ARC_BOTTOM = 180

// Semantic connection states → color. The label is localized via getText under
// the `status_<key>` msgid (see page/i18n). An unknown key falls back to its raw
// string in grey, so update('Pairing…') still shows something sane.
const COLORS = {
  checking: 0xffcc66,
  online: 0x00ef33,
  offline: 0xff6666,
  failed: 0xff6666,
}

const labelFor = (key) => {
  const color = COLORS[key]
  return color === undefined ? { text: String(key), color: 0xcccccc } : { text: getText(`status_${key}`), color }
}

// Curved-text span (degrees) for a string at this radius/size — same formula as
// the battery arc (glyph advance ≈ 0.62·text_size). The TEXT widget shares the
// ARC angle convention (0° = 12 o'clock), so ARC_BOTTOM is used directly.
const spanOf = (str) => str.length * ((TEXT_SIZE * 0.62) / RADIUS) * (180 / Math.PI)

export default function Status(initial) {
  const update = (key) => {
    const s = labelFor(key)
    const span = spanOf(s.text)
    // The full-screen box centers the arc on the screen center; radius + start/end
    // angles place the text along the bezel.
    text({
      x: 0,
      y: 0,
      w: width,
      h: height,
      text: s.text,
      text_size: TEXT_SIZE,
      color: s.color,
      radius: RADIUS,
      mode: 1,
      start_angle: Math.round(ARC_BOTTOM - span / 2),
      end_angle: Math.round(ARC_BOTTOM + span / 2),
    })
  }

  update(initial)
  return { update }
}
