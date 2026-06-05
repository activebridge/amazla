import { button, img, height } from './../../../../pages/ui.js'

// Square-screen action button.
//
// The same rounded Tesla-red pill as the round layout, anchored near the bottom
// edge (status time lives at the top). Round screens use a slightly higher
// offset — see button.r.layout.js. Resolved at build time via the
// `zosLoader:./button.[pf].layout.js` import in slide.js ([pf] → 's' here).
//
// The pill's gradient + rounded corners are baked into buttons/btn-red.png at
// its native PILL_W × PILL_H so the IMG is drawn 1:1 (no scaling, crisp
// corners). The BUTTON on top has no normal image (buttons/press.png is absent,
// so it stays transparent and the gradient shows through) and a 50% black press
// overlay (buttons/_press.png) so taps read as pressed — only its label, the
// overlay and the tap target come from the BUTTON.
//
//   text     label string
//   onClick  tap handler
const PILL_W = 220
const PILL_H = 72

export const PairButton = ({ text, onClick }) => {
  // center() adds (height - h)/2; the extra -margin drops it to the bottom edge.
  const margin = 20
  const y = (height - PILL_H) / 2 - margin

  img({ src: 'buttons/btn-red.png', y, w: PILL_W, h: PILL_H })

  return button({
    y,
    w: PILL_W,
    h: PILL_H,
    text,
    text_size: 36,
    color: 0xffffff,
    // src 'press' -> normal buttons/press.png (absent = transparent, gradient
    // shows through) + press buttons/_press.png (50% black overlay on tap).
    src: 'press',
    radius: 0,
    click_func: onClick,
  })
}
