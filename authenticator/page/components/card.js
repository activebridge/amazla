import { prop } from '@zos/ui'
import { rect, text } from './../../../pages/ui.js'
import { generateTOTP, formatCode } from './../libs/totp.js'

const font = 'fonts/Jua.ttf'

// 18 gradient colors for visible digits (pink → yellow → green)
const COLORS = [
  0xf4468f, 0xfd4a85, 0xff507a, 0xff566f, 0xff5e63, 0xff6658,
  0xff704e, 0xff7a45, 0xff843d, 0xf99533, 0xf3a130, 0xeaad2f,
  0xe6b32e, 0xdcbe30, 0xd2c934, 0xc8d43a, 0xbfde43, 0xaff05b,
]

export const Card = (acc, y, colorIndex, { card, name, digit }) => {
  const { x, w, h, radius } = card
  const c = { centered: false }

  // Shadows + Background
  const shadowH = h / 2 | 0
  rect({ x, y: y + h - shadowH + 3, w, h: shadowH, radius, color: 0x151515, ...c })
  rect({ x, y: y - 2, w, h: shadowH, radius, color: 0x404040, ...c })
  rect({ x, y, w, h, radius, color: 0x2a2a2a, ...c })

  // Name
  text({ x, y: y + name.y, w, h: name.h, text: acc.issuer || acc.name, text_size: name.text_size, ...c })

  // Digits with gradient colors and custom font
  const digitY = y + digit.y
  const digitCenterX = x + w / 2 | 0
  const digitWidgets = [0, 1, 2, 3, 4, 5].map(i =>
    text({
      x: digitCenterX + digit.offsets[i],
      y: digitY,
      w: digit.w,
      h: digit.h,
      text: '-',
      text_size: digit.text_size,
      color: COLORS[(colorIndex + i) % 18],
      font,
      ...c,
    })
  )

  const update = () => {
    const code = formatCode(generateTOTP(acc.secret, acc.digits || 6))
    const digits = code.replace(' ', '').split('')
    digitWidgets.forEach((widget, i) => {
      widget && digits[i] && widget.setProperty(prop.TEXT, digits[i])
    })
  }

  return { update }
}
