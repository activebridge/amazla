import { rect, text } from './../../../../pages/ui.js'

export const Title = (title, { x, y, w, h, text_size, radius: radiusProp }) => {
  const c = { centered: false }
  const margin = 10
  const titleX = x + margin
  const titleW = w - margin * 2
  // Use the card's radius when provided (e.g. the OS-reported sz.radius), but
  // subtract the pill's inset so its corners stay concentric with the card
  // (inner radius = outer radius − padding); else fall back to the rounded default.
  const radius = radiusProp != null ? Math.max(0, radiusProp - margin) : (h / 2.5 | 0)

  // Light bottom (pressed in)
  rect({ x: titleX, y: y + 2, w: titleW, h: h - 2, radius, color: 0xcecece, ...c })
  // Main background
  rect({ x: titleX, y: y + 2, w: titleW, h: h - 4, radius: radius - 2, color: 0x000000, ...c })
  // Name text
  const name = text({ x: titleX, y, w: titleW, h, text: title, text_size, char_space: 3, ...c })

  const update = (newName) => {
    name.set({ text: newName })
  }

  return { update }
}
