import * as hmUI from '@zos/ui'
import { animation, circle } from './../../../pages/ui.js'

// Round-screen connecting indicator: a full-screen black circle LIGHTLY veiling the
// car, with a looping PNG-sequence spinner (IMG_ANIM) on top. Painted only while the
// connection is 'checking' (see page/index.js). Loaded via the `[pf]` zosLoader; the
// square build gets connecting.s.layout.js instead.
//
// The veil is intentionally light (alpha 70, not the circle() default 150) so the
// LAST-KNOWN cached car state — hydrated on app open from store.lastVehicleState —
// stays clearly visible while we fetch the fresh status; the spinner just signals the
// live read is in flight. circle() defaults: black, radius = height/2, tap disabled.
//
// Spinner frames: assets/common.r/connecting/connecting0.png … connecting11.png
// — a 12-dot ring with the bright head fading clockwise into the tail. IMG_ANIM
// plays them on the hardware timer (no manual setTimeout). 12 frames @ 12 fps =
// one rotation per second.
const SPINNER = {
  anim_path: 'connecting',
  anim_prefix: 'connecting',
  anim_ext: 'png',
  anim_fps: 12,
  anim_size: 12, // frame count — matches the PNGs in assets/*/connecting
  repeat_count: 0, // 0 = loop forever
  anim_status: hmUI.anim_status.START,
  w: 160,
  h: 160,
}

export const Connecting = (slide) => {
  circle({ alpha: 70 }, slide)
  animation(SPINNER, slide)
}
