import { prop } from '@zos/ui'
import { text } from './../../../../pages/ui.js'

const font = 'fonts/Jua.ttf'

// 34 gradient colors for smooth loop (pink → green → pink)
const COLORS = [
  0xf4468f, 0xfd4a85, 0xff507a, 0xff566f, 0xff5e63, 0xff6658,
  0xff704e, 0xff7a45, 0xff843d, 0xf99533, 0xf3a130, 0xeaad2f,
  0xe6b32e, 0xdcbe30, 0xd2c934, 0xc8d43a, 0xbfde43, 0xaff05b,
  0xbfde43, 0xc8d43a, 0xd2c934, 0xdcbe30, 0xe6b32e, 0xeaad2f,
  0xf3a130, 0xf99533, 0xff843d, 0xff7a45, 0xff704e, 0xff6658,
  0xff5e63, 0xff566f, 0xff507a, 0xfd4a85,
]

const parse = (code) => {
  const parts = code.split(' ')
  return [parts[0] || '---', parts[1] || '---']
}

export const Code = (code = '--- ---', colorIndex, { centerX, y, w, h, text_size }) => {
  const c = { centered: false }
  const halfW = w / 2 | 0
  const gap = 10
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

  const first = createHalf(centerX - halfW - gap, true, COLORS[(colorIndex * 2) % 34], p1)
  const second = createHalf(centerX + gap, false, COLORS[(colorIndex * 2 + 1) % 34], p2)

  const update = (code) => {
    const [p1, p2] = parse(code)
    first.lightShadow.setProperty(prop.TEXT, p1)
    first.darkShadow.setProperty(prop.TEXT, p1)
    first.main.setProperty(prop.TEXT, p1)
    second.lightShadow.setProperty(prop.TEXT, p2)
    second.darkShadow.setProperty(prop.TEXT, p2)
    second.main.setProperty(prop.TEXT, p2)
  }

  return { update }
}
