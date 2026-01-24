import { prop } from '@zos/ui'
import { text } from './../../../../pages/ui.js'
import { GRADIENT_COLORS } from './../../../shared/colors.js'

const font = 'fonts/Jua.ttf'

const parse = (code) => {
  const parts = code.split(' ')
  return [parts[0] || '---', parts[1] || '---']
}

export const Code = (code = '--- ---', colorIndex, { centerX, y, w, h, text_size, gap = 10 }) => {
  const c = { centered: false }
  const halfW = w / 2 | 0
  const [p1, p2] = parse(code)

  const createHalf = (x, alignRight, color, txt) => {
    const lightShadow = text({
      x: x - 1, y: y - 1, w: halfW, h, text: txt, text_size,
      color: 0xc0c0c0, font, align_h: alignRight ? 2 : 0, ...c,
    })
    const darkShadow = text({
      x: x + 2, y: y + 3, w: halfW, h, text: txt, text_size,
      color: 0x000000, font, align_h: alignRight ? 2 : 0, ...c,
    })
    const main = text({
      x, y, w: halfW, h, text: txt, text_size,
      color, font, align_h: alignRight ? 2 : 0, ...c,
    })
    return { lightShadow, darkShadow, main }
  }

  const first = createHalf(centerX - halfW - gap, true, GRADIENT_COLORS[(colorIndex * 2) % 34], p1)
  const second = createHalf(centerX + gap, false, GRADIENT_COLORS[(colorIndex * 2 + 1) % 34], p2)

  const update = (code, newColorIndex) => {
    const [p1, p2] = parse(code)
    first.lightShadow.setProperty(prop.TEXT, p1)
    first.darkShadow.setProperty(prop.TEXT, p1)
    first.main.setProperty(prop.TEXT, p1)
    second.lightShadow.setProperty(prop.TEXT, p2)
    second.darkShadow.setProperty(prop.TEXT, p2)
    second.main.setProperty(prop.TEXT, p2)
    if (newColorIndex !== undefined) {
      first.main.setProperty(prop.COLOR, GRADIENT_COLORS[(newColorIndex * 2) % 34])
      second.main.setProperty(prop.COLOR, GRADIENT_COLORS[(newColorIndex * 2 + 1) % 34])
    }
  }

  return { update }
}
