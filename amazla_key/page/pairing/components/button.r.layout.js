import { button, img, width, height } from './../../../../pages/ui.js'

// Round-screen action button.
//
// A full-width Tesla-red bar flush to the bottom edge of the face. The curved
// bezel crops the bottom corners, so no rounding is needed. Square screens use
// an inset rounded pill — see button.s.layout.js. Resolved at build time via
// the `zosLoader:./button.[pf].layout.js` import in slide.js ([pf] → 'r' here).
//
// A BUTTON won't stretch the 1px gradient across its width, so the gradient is
// drawn as a separate IMG background (auto_scale stretches buttons/btn-red.png
// to the full bar) and the BUTTON on top has no normal image (buttons/press.png
// is absent, so it stays transparent and the gradient shows through) and a 50%
// black press overlay (buttons/_press.png) so taps read as pressed.
//
//   text     label string
//   onClick  tap handler
export const PairButton = ({ text, onClick }) => {
  const h = 88
  // center() adds (height - h)/2; this y pulls the bar flush to the bottom edge.
  const y = (height - h) / 2

  img({ src: 'buttons/btn-red.png', x: 0, y, w: width, h })

  return button({
    y,
    w: width,
    h,
    text,
    text_size: 36,
    color: 0xffffff,
    src: 'press',
    radius: 0,
    click_func: onClick,
  })
}
