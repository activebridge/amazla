import * as hmUI from '@zos/ui'
import { animation, circle, screenShape } from './../../../pages/ui.js'

// Connecting indicator for BOTH screen shapes. A LIGHT veil (alpha 70) lets the
// cached last-known car show through while connecting, with the 12-dot IMG_ANIM
// spinner centered on top. The art + behaviour are identical on round and square
// (the frame PNGs are byte-for-byte the same), so this is ONE shared file — no
// `[pf]` split. Imported directly by page/main.js.
//
// The ONE shape-dependent bit is a centering constant: IMG_ANIM is top-left
// anchored and draws frames at native size, so center()'s x = (width - w)/2 needs
// the frame's size AS RENDERED in the device's coordinate space — which differs
// with per-device design scaling (round build ~160, the smaller square build ~130).
// screenShape: 1 = round, 0 = square (see pages/ui.js / authenticator usage).
const FRAME = screenShape === 1 ? 160 : 130

const SPINNER = {
  anim_path: 'connecting',
  anim_prefix: 'connecting',
  anim_ext: 'png',
  anim_fps: 12,
  anim_size: 12,
  repeat_count: 0,
  anim_status: hmUI.anim_status.START,
  centered: true,
  w: FRAME,
  h: FRAME,
}

export const Connecting = (slide) => {
  circle({ alpha: 70 }, slide)
  animation(SPINNER, slide)
}
