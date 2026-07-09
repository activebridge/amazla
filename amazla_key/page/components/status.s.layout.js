import { height, text, width } from './../../../pages/ui.js'

// Square-screen status renderer: a plain centered text line flush at the BOTTOM
// edge of the screen — the flat-screen counterpart to the round build's 6 o'clock
// bezel arc (status.r.layout.js). No native top status bar; the page keeps it
// hidden. Exports ONLY the draw function — the state→label→color logic and the
// { update } factory live in status.js, which imports this via the `[pf]`
// zosLoader (build-time selected).
//
// pages/ui.js normally positions center-relative; we want an exact bottom-edge
// placement, so pass centered:false to use absolute x/y and align_v:'bottom' so
// the text hugs the bottom of its box (which sits against the screen edge).

const TEXT_SIZE = 24
const BOX_H = 40

export default function draw({ text: label, color }) {
  text({
    centered: false,
    x: 0,
    y: height - BOX_H, // box hugs the bottom screen edge
    w: width,
    h: BOX_H,
    align_h: 'center',
    align_v: 'bottom',
    text: label,
    text_size: TEXT_SIZE,
    color,
  })
}
