import { rect, text } from './../../../../pages/ui.js'

export const Title = (name, { x, y, w, h, text_size }) => {
  const c = { centered: false }
  const margin = 10
  const titleX = x + margin
  const titleW = w - margin * 2
  const radius = h / 2.5 | 0

  // Light bottom (pressed in)
  rect({ x: titleX, y: y + 2, w: titleW, h: h - 2, radius, color: 0xcecece, ...c })
  // Main background
  rect({ x: titleX, y: y + 2, w: titleW, h: h - 4, radius: radius - 2, color: 0x000000, ...c })
  // Name text
  text({ x: titleX, y, w: titleW, h, text: name, text_size, char_space: 3, ...c })
}
