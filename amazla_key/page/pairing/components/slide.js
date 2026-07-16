import * as hmUI from '@zos/ui'
import { animation, img, text } from './../../../../pages/ui.js'
import { PairButton } from 'zosLoader:./button.[pf].layout.js'

// Animated illustration for the "Connecting to your Tesla" step — the same 12-dot
// IMG_ANIM used by the main page's connecting overlay (assets/common.[r|s]/
// connecting/connecting_{0..11}.png), placed where a slide's static illustration
// would sit (y:-130, 160²). Frames MUST be named `{anim_prefix}_{index}.png` or the
// engine plays nothing (device gotcha). repeat_count:0 = loop forever.
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
  y: -130,
}

// Slide — one full-screen pairing step.
//
// Shape-agnostic layout, top to bottom:
//   illustration · title · optional action button
//
// Only the action button differs between round and square screens, so it is
// delegated to the shape-specific PairButton (button.[r|s].layout.js), resolved
// at build time by the `zosLoader:` import above.
//
//   image    asset name under assets/common.[r|s] (without extension),
//            e.g. 'pairing/02-ready-synced'
//   title    centered, word-wrapped status text
//   button   optional label string; with onClick it renders the action button
//   onClick  optional tap handler for the button
//
// Widgets render straight onto the page (no GROUP wrapper) — only one slide is
// ever on screen at a time (render() calls UI.reset() first), so there is no
// scroll container to host. GROUP is for stacking multiple scroll screens.
export const Slide = ({ image, spinner, title, button, onClick }) => {
  if (spinner) {
    animation(SPINNER)
  } else if (image) {
    img({ src: image + '.png', w: 160, h: 160, y: -130 })
  }
  if (title) {
    text({
      text: title,
      y: 30,
      w: 320,
      h: 160,
      text_size: 30,
      text_style: hmUI.text_style.WRAP,
    })
  }
  if (button && onClick) {
    PairButton({ text: button, onClick })
  }
}
