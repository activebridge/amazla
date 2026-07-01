import * as hmUI from '@zos/ui'
import { animation, circle } from './../../../pages/ui.js'

// Square-screen connecting indicator: same as the round build — a LIGHT veil
// (alpha 70) so the cached last-known car state shows through while connecting, plus
// the centered 12-dot IMG_ANIM spinner (shape-agnostic art). Loaded via `[pf]`.
const SPINNER = {
  anim_path: 'connecting',
  anim_prefix: 'connecting',
  anim_ext: 'png',
  anim_fps: 12,
  anim_size: 12,
  repeat_count: 0,
  anim_status: hmUI.anim_status.START,
  w: 160,
  h: 160,
}

export const Connecting = (slide) => {
  circle({ alpha: 70 }, slide)
  animation(SPINNER, slide)
}
