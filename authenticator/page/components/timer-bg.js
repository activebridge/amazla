import { rect, img, width, height } from './../../../pages/ui.js'

// v2/v3 timer background in 2 widgets: a solid FILL_RECT in the current timer
// color + a static vignette PNG (black side edges -> transparent center) on top.
// Compositing the mask (alpha = 1-b) over the rect reproduces the per-column
// dim(color, b*dimFactor) of the old 32-rect version, but far cheaper.
// (v1 keeps its rect-column version — it can't stretch images.)
const GREEN = 0xaff05b // brightest green from the code gradient (calm)
const PINK = 0xf4468f // pink end of the code gradient (warning)
const WARN_AT = 5 // last 5s ramp green -> pink; before that stays green
const DIM_DARK = 0.2 // brightness during the calm (green) phase
const DIM_BRIGHT = 0.4 // brightness in the last seconds (pink warning)
const OVER = 40 // extend past the top so ZeppOS overscroll still shows the bg

function lerp(a, b, t) {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff
  return (((ar + (br - ar) * t) | 0) << 16) | (((ag + (bg - ag) * t) | 0) << 8) | ((ab + (bb - ab) * t) | 0)
}

// scale a color toward black by brightness b (0..1)
function dim(color, b) {
  return ((((color >> 16) & 0xff) * b | 0) << 16) | ((((color >> 8) & 0xff) * b | 0) << 8) | ((color & 0xff) * b | 0)
}

export const Timer = (h = height) => {
  // solid color bar (recolored each second), behind everything
  const bar = rect({ centered: false, x: 0, y: -OVER, w: width, h: h + OVER, color: dim(GREEN, DIM_DARK) })
  if (bar.setEnable) bar.setEnable(false)

  // static vignette mask on top: black at the side edges -> transparent center
  const mask = img({ centered: false, x: 0, y: -OVER, w: width, h: h + OVER, src: 'timer_mask.png' })
  if (mask && mask.setEnable) mask.setEnable(false)

  return {
    update: (remaining) => {
      const t = remaining >= WARN_AT ? 0 : 1 - remaining / WARN_AT // 0 calm -> 1 warning
      const color = lerp(GREEN, PINK, t)
      const dimFactor = DIM_DARK + (DIM_BRIGHT - DIM_DARK) * t // darker until the last 5s
      bar.set({ centered: false, x: 0, y: -OVER, w: width, h: h + OVER, color: dim(color, dimFactor) })
    },
  }
}
