import { height, text, width } from './../../../pages/ui.js'

// Round-screen status renderer: a curved-text label hugging the bottom of the
// bezel (6 o'clock), same arc typography as the battery component. Painted through
// pages/ui.js text() so it's tracked by UI.reset(). Exports ONLY the draw function
// — the state→label→color logic and the { update } factory live in status.js,
// which imports this via `zosLoader:./status.[pf].layout.js` (build-time selected).

// Arc text sits just inside the bezel, centered on 6 o'clock. ZeppOS angles:
// 0° at the top, clockwise; on the bottom half mode 1 flips glyphs upright.
const RADIUS = height / 2 - 8
const TEXT_SIZE = 26
const ARC_BOTTOM = 180

// Curved-text span (degrees) for a string at this radius/size — same formula as
// the battery arc (glyph advance ≈ 0.62·text_size). The TEXT widget shares the
// ARC angle convention (0° = 12 o'clock), so ARC_BOTTOM is used directly.
const spanOf = (str) => str.length * ((TEXT_SIZE * 0.62) / RADIUS) * (180 / Math.PI)

export default function draw({ text: label, color }) {
  const span = spanOf(label)
  // The full-screen box centers the arc on the screen center; radius + start/end
  // angles place the text along the bezel.
  text({
    x: 0,
    y: 0,
    w: width,
    h: height,
    text: label,
    text_size: TEXT_SIZE,
    color,
    radius: RADIUS,
    mode: 1,
    start_angle: Math.round(ARC_BOTTOM - span / 2),
    end_angle: Math.round(ARC_BOTTOM + span / 2),
  })
}
