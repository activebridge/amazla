import { rect } from './../../../pages/ui.js'
import { Title } from './card/title.js'
import { Code } from './card/code.js'

export const Card = (acc, code = null, y, colorIndex, { card, name, digit }) => {
  const { x, w, h, radius } = card
  const c = { centered: false }

  // Shadows + Background
  const shadowH = h / 2 | 0
  rect({ x, y: y - 2, w, h: shadowH, radius, color: 0xcecece, ...c })
  rect({ x, y, w, h, radius, color: 0x3a3a3a, ...c })

  // Title
  const title = Title(acc.issuer || acc.name, {
    x,
    y: y + name.y,
    w,
    h: name.h,
    text_size: name.text_size,
  })

  // Code
  const codeWidget = Code(code || undefined, colorIndex, {
    centerX: x + w / 2 | 0,
    y: y + digit.y,
    w,
    h: digit.h,
    text_size: digit.text_size,
  })

  const update = ({ title: t, code: c, colorIndex: ci }) => {
    if (t) title.update(t)
    if (c) codeWidget.update(c, ci)
  }

  return { update }
}
