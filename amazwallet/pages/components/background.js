import { rect, width, height } from './../../../pages/ui.js'

// Same look as the authenticator v1 background: a horizontal gradient built from
// tall FILL_RECT columns — black at the side edges fading to a dim green center.
// Static (no timer). Thinner than authenticator: a wider edge fade => a narrower
// bright center band.
const GREEN = 0xaff05b
const COLS = 16
const BAND = 0.78 // fraction of width that fades at each edge (bigger = thinner center)
const DIM = 0.42 // overall brightness of the center
const OVER = 40 // extend past the top so overscroll still shows the bg

const dim = (color, b) =>
  ((((color >> 16) & 0xff) * b | 0) << 16) |
  ((((color >> 8) & 0xff) * b | 0) << 8) |
  ((color & 0xff) * b | 0)

export const Background = (h = height) => {
  const colW = Math.ceil(width / COLS) + 1
  for (let i = 0; i < COLS; i++) {
    const x = (i * width / COLS) | 0
    const cx = (x + colW / 2) / width // column center, 0..1
    const edge = Math.min(cx, 1 - cx) // 0 at edges -> 0.5 at center
    const b = Math.min(1, edge / BAND) // 0 (edge) -> 1 (center)
    rect({ centered: false, x, y: -OVER, w: colW, h: h + OVER, color: dim(GREEN, b * DIM) })
  }
}
