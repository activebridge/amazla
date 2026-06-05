import * as hmUI from '@zos/ui'
import { img, text } from './../../../../pages/ui.js'
import { PairButton } from 'zosLoader:./button.[pf].layout.js'

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
export const Slide = ({ image, title, button, onClick }) => {
  if (image) {
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
