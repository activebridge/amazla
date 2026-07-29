import { text, isV1 } from './../../../../pages/ui.js'
import { GRADIENT_COLORS } from './../../../shared/colors.js'

// API 1.0 TEXT has no custom-font support — the widget renders nothing at all —
// so old watches (GTR 3, GTR 3 Pro, GTS 3, GTS 4 Mini, Band 7) fall back to the
// system font. Every caller inherits this; a caller can still pass its own.
const DEFAULT_FONT = isV1 ? null : 'fonts/Jua.ttf'

const parse = (code) => {
  const parts = code.split(' ')
  return [parts[0] || '---', parts[1] || '---']
}

export const Code = (code = '--- ---', colorIndex, { centerX, y, w, h, text_size, gap = 10, font = DEFAULT_FONT }) => {
  const c = font ? { font, centered: false } : { centered: false }
  const halfW = w / 2 | 0
  const [p1, p2] = parse(code)

  const createHalf = (x, alignRight, color, txt) => {
    const lightShadow = text({
      x: x - 1, y: y - 1, w: halfW, h, text: txt, text_size,
      color: 0xc0c0c0, align_h: alignRight ? 'right' : 'left', ...c,
    })
    const darkShadow = text({
      x: x + 2, y: y + 3, w: halfW, h, text: txt, text_size,
      color: 0x000000, align_h: alignRight ? 'right' : 'left', ...c,
    })
    const main = text({
      x, y, w: halfW, h, text: txt, text_size,
      color, align_h: alignRight ? 'right' : 'left', ...c,
    })
    return { lightShadow, darkShadow, main }
  }

  const first = createHalf(centerX - halfW - gap, true, GRADIENT_COLORS[(colorIndex * 2) % 34], p1)
  const second = createHalf(centerX + gap, false, GRADIENT_COLORS[(colorIndex * 2 + 1) % 34], p2)

  const update = (code, newColorIndex) => {
    const [p1, p2] = parse(code)
    first.lightShadow.set({ text: p1 })
    first.darkShadow.set({ text: p1 })
    first.main.set({ text: p1 })
    second.lightShadow.set({ text: p2 })
    second.darkShadow.set({ text: p2 })
    second.main.set({ text: p2 })
    if (newColorIndex !== undefined) {
      first.main.set({ color: GRADIENT_COLORS[(newColorIndex * 2) % 34] })
      second.main.set({ color: GRADIENT_COLORS[(newColorIndex * 2 + 1) % 34] })
    }
  }

  return { update }
}
