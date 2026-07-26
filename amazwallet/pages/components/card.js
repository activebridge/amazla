import { button, rect, text, circle, img } from './../../../pages/ui.js'

export const Card = (card, y, i, dims, onClick) => {
  const { x, w, h, radius } = dims.card
  const c = { centered: false }
  const color = card.color != null ? card.color : 0x3a3a3a

  // Shadow + top highlight for an embossed edge (authenticator-style).
  rect({ x, y: y + 3, w, h, radius, color: 0x000000, ...c })
  rect({ x, y: y - 2, w, h: h / 2 | 0, radius, color: 0xcecece, ...c })

  // Card body.
  rect({ x, y, w, h, radius, color, ...c })

  // Gradient overlay (transparent -> semitransparent). Even cards mirror it
  // right-to-left so it alternates with the dot corner.
  img({ x, y, w, h, src: (i % 2 === 0) ? 'gradient_flip.png' : 'gradient.png', ...c })

  // Soft semitransparent circles in the bottom corner opposite the dot, anchored
  // to the edges so they stay inside the card (no rounded-rect clipping on watch).
  const blob = (cx, cy, r, a) => circle({ x: cx - r, y: cy - r, w: r * 2, h: r * 2, radius: r, color: 0x000000, alpha: a, ...c })
  const bx = (i % 2 === 0) ? (x + w) : x
  const bdir = (i % 2 === 0) ? -1 : 1
  const r1 = h * 0.7 | 0
  const r2 = h * 0.35 | 0
  // Center near the corner so they hug the edges; the overflow is black-on-black
  // (invisible) so it just darkens the corner.
  blob(bx + bdir * (r1 * 0.35 | 0), y + h - (r1 * 0.35 | 0), r1, 40)
  blob(bx + bdir * (r2 * 0.35 | 0), y + h - (r2 * 0.35 | 0), r2, 55)

  // Engraved black dot in a top corner (alternating: even = left, odd = right).
  // Same inset look as the authenticator name box — light circle peeking below a
  // black circle on top.
  const dotR = Math.max(8, h * 0.11 | 0)
  const dotM = dotR + 8
  const dotCx = (i % 2 === 0) ? (x + dotM) : (x + w - dotM)
  const dotCy = y + dotM
  circle({ x: dotCx - dotR, y: dotCy - dotR + 2, w: dotR * 2, h: dotR * 2, radius: dotR, color: 0xcecece, alpha: 255, ...c })
  circle({ x: dotCx - dotR, y: dotCy - dotR, w: dotR * 2, h: dotR * 2, radius: dotR, color: 0x000000, alpha: 255, ...c })

  // Silver engraved name — light up-left, dark down-right, silver main.
  // Full card width: the text is centered anyway, so an inset only costs room
  // for long names on narrow screens.
  const base = { w, h, text: card.title || '', text_size: dims.name.text_size, align_h: 'center', align_v: 'center', ...c }
  text({ ...base, x: x - 1, y: y - 1, color: 0xe8e8e8 })
  text({ ...base, x: x + 2, y: y + 3, color: 0x000000 })
  const title = text({ ...base, x, y, color: 0xc0c0c0 })

  // Transparent click layer on top — the text widgets would otherwise swallow
  // the tap, so the tap target has to sit above everything.
  button({ x, y, w, h, radius, src: 'clear', click_func: () => onClick(i), ...c })

  const update = ({ title: t }) => {
    if (t !== undefined) title.set({ text: t })
  }

  return { update }
}
