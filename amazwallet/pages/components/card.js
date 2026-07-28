import { button, rect, text, circle, img } from './../../../pages/ui.js'

export const Card = (card, y, i, dims, onClick) => {
  const { x, w, h, radius } = dims.card
  const c = { centered: false }
  const color = card.color != null ? card.color : 0x3a3a3a

  // Shadow + top highlight for an embossed edge (authenticator-style).
  rect({ x, y: y + 3, w, h, radius, color: 0x000000, ...c })
  rect({ x, y: y - 2, w, h: h / 2 | 0, radius, color: 0xcecece, ...c })

  // Card body.
  const body = rect({ x, y, w, h, radius, color, ...c })

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
  // black circle on top. Off where the caller has no room for it: in the app
  // widget it lands under a chevron.
  if (dims.dot !== false) {
    const dotR = Math.max(8, h * 0.11 | 0)
    const dotM = dotR + 8
    const dotCx = (i % 2 === 0) ? (x + dotM) : (x + w - dotM)
    const dotCy = y + dotM
    circle({ x: dotCx - dotR, y: dotCy - dotR + 2, w: dotR * 2, h: dotR * 2, radius: dotR, color: 0xcecece, alpha: 255, ...c })
    circle({ x: dotCx - dotR, y: dotCy - dotR, w: dotR * 2, h: dotR * 2, radius: dotR, color: 0x000000, alpha: 255, ...c })
  }

  // Silver engraved name — light up-left, dark down-right, silver main.
  // Full card width: the text is centered anyway, so an inset only costs room
  // for long names on narrow screens.
  // Name box, narrower than the card when the caller reserves room beside it
  // (the app widget puts its chevrons on the card's edges), re-centred so the
  // text still sits in the middle of what is left.
  const nameW = dims.name.w || w
  const nameX = x + (((w - nameW) / 2) | 0)
  // Optional vertical nudge for callers whose card is not the list's shape.
  const nameY = y + (dims.name.dy || 0)
  const base = { w: nameW, h, text: card.title || '', text_size: dims.name.text_size, align_h: 'center', align_v: 'center', ...c }

  // Two ways to set the name. `dims.name.box` gives the authenticator's inset
  // pill — a light edge under a black plate, white text on top — for surfaces
  // that need the name to hold its own against a busy card. Without it, the
  // name is engraved straight into the card, three stacked TEXT widgets deep,
  // and all three have to be updated or the old name shows through as its own
  // highlight and shadow.
  const box = dims.name.box
  let titleLayers

  if (box) {
    const inset = box.inset != null ? box.inset : 10
    const bx = x + inset
    const bw = w - inset * 2
    const by = y + (box.y || 0)
    const bh = box.h
    // Concentric with the card while the plate hugs its edge; once it is inset
    // further than the card's radius that subtraction goes negative and squares
    // the corners off, so a pill radius takes over.
    const pill = (bh / 2.5) | 0
    const br = box.radius != null ? Math.max(box.radius - inset, pill) : pill
    rect({ x: bx, y: by + 2, w: bw, h: bh - 2, radius: br, color: 0xcecece, ...c })
    rect({ x: bx, y: by + 2, w: bw, h: bh - 4, radius: Math.max(0, br - 2), color: 0x000000, ...c })
    titleLayers = [
      text({ ...base, x: bx, y: by, w: bw, h: bh, char_space: 3, color: 0xffffff }),
    ]
  } else {
    titleLayers = [
      text({ ...base, x: nameX - 1, y: nameY - 1, color: 0xe8e8e8 }),
      text({ ...base, x: nameX + 2, y: nameY + 3, color: 0x000000 }),
      text({ ...base, x: nameX, y: nameY, color: 0xc0c0c0 }),
    ]
  }

  // Transparent click layer on top — the text widgets would otherwise swallow
  // the tap, so the tap target has to sit above everything.
  button({ x, y, w, h, radius, src: 'clear', click_func: () => onClick(i), ...c })

  // Colour is settable so a surface that swaps which card it shows — the app
  // widget — can repoint these widgets instead of rebuilding. In an AppWidget,
  // createWidget only works inside build(); a later call returns undefined.
  const update = ({ title: t, color: col }) => {
    if (t !== undefined) titleLayers.forEach((layer) => layer.set({ text: t }))
    if (col !== undefined) body.set({ color: col })
  }

  return { update }
}
