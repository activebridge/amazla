import { prop } from '@zos/ui'
import { text, arc, img, size } from './../../pages/ui.js'
import { getCode } from './../page/libs/totp.js'
import { GRADIENT_COLORS } from './../shared/colors.js'

// Arc background colors - grey gradient
const ARC_BG_COLORS = [0x2a2a2a, 0x333333, 0x3c3c3c, 0x454545, 0x3c3c3c, 0x333333]
const ARC_BG_COLOR = 0x3a3a3a

const GAP_ANGLE = 3
const SEGMENT_ANGLE = (360 - GAP_ANGLE * 6) / 6
const TEXT_SIZE = size * 0.09 | 0
const NAME_SIZE = size * 0.055 | 0
const ARC_SIZE = size
const ARC_LINE_WIDTH = 55
const CODE_RADIUS = size / 2
const NAME_RADIUS = size / 2 - 60

let codeWidgets = []

export const refreshCodes = () => {
  codeWidgets.forEach(({ dark1, main1, dark2, main2, acc, isBottom }) => {
    const fullCode = getCode(acc)
    const half1 = isBottom ? fullCode.slice(3) : fullCode.slice(0, 3)
    const half2 = isBottom ? fullCode.slice(0, 3) : fullCode.slice(3)
    dark1.setProperty(prop.TEXT, half1)
    main1.setProperty(prop.TEXT, half1)
    dark2.setProperty(prop.TEXT, half2)
    main2.setProperty(prop.TEXT, half2)
  })
}

export const updateAccounts = (newAccounts) => {
  codeWidgets.forEach((widget, i) => {
    if (newAccounts[i]) {
      widget.acc = newAccounts[i]
      const name = (newAccounts[i].issuer || newAccounts[i].name || 'Account').slice(0, 10)
      widget.nameText.setProperty(prop.TEXT, name)
    }
  })
  refreshCodes()
}

export const Layout = (accounts) => {
  codeWidgets = []

  if (accounts.length === 0) {
    text({ text: 'No accounts', text_size: 30, color: 0x888888 })
    return {}
  }

  // First pass: render all arcs
  accounts.forEach((acc, i) => {
    const startAngle = -175 + i * (SEGMENT_ANGLE + GAP_ANGLE)
    const endAngle = startAngle + SEGMENT_ANGLE

    arc({
      w: ARC_SIZE,
      h: ARC_SIZE,
      line_width: ARC_LINE_WIDTH,
      color: ARC_BG_COLORS[i],
      start_angle: startAngle,
      end_angle: endAngle,
    })
  })

  // Second pass: render all codes and names
  accounts.forEach((acc, i) => {
    const startAngle = -175 + i * (SEGMENT_ANGLE + GAP_ANGLE)
    const endAngle = startAngle + SEGMENT_ANGLE
    const isBottom = i >= 3
    const angleOffset = 90

    // Code split into two halves with different colors (like cards)
    const fullCode = getCode(acc)
    const midAngle = startAngle + SEGMENT_ANGLE / 2
    const color1 = GRADIENT_COLORS[(i * 2) % 34]
    const color2 = GRADIENT_COLORS[(i * 2 + 1) % 34]

    // For bottom, swap halves (no reverse needed, mode:1 handles orientation)
    const half1 = isBottom ? fullCode.slice(3) : fullCode.slice(0, 3)
    const half2 = isBottom ? fullCode.slice(0, 3) : fullCode.slice(3)
    const charSpace = isBottom ? 2 : 0
    const codeGap = 6  // Padding to bring halves closer

    // First half shadows and main
    const dark1 = text({
      text: half1,
      text_size: TEXT_SIZE,
      char_space: charSpace,
      color: 0x000000,
      start_angle: startAngle + codeGap + angleOffset + (isBottom ? -1 : 1),
      end_angle: midAngle + angleOffset + (isBottom ? -1 : 1),
      radius: CODE_RADIUS + (isBottom ? 2 : -2),
      mode: isBottom ? 1 : 0,
    })
    const main1 = text({
      text: half1,
      text_size: TEXT_SIZE,
      char_space: charSpace,
      color: color1,
      start_angle: startAngle + codeGap + angleOffset,
      end_angle: midAngle + angleOffset,
      radius: CODE_RADIUS,
      mode: isBottom ? 1 : 0,
    })

    // Second half shadows and main
    const dark2 = text({
      text: half2,
      text_size: TEXT_SIZE,
      char_space: charSpace,
      color: 0x000000,
      start_angle: midAngle + angleOffset + (isBottom ? -1 : 1),
      end_angle: endAngle - codeGap + angleOffset + (isBottom ? -1 : 1),
      radius: CODE_RADIUS + (isBottom ? 2 : -2),
      mode: isBottom ? 1 : 0,
    })
    const main2 = text({
      text: half2,
      text_size: TEXT_SIZE,
      char_space: charSpace,
      color: color2,
      start_angle: midAngle + angleOffset,
      end_angle: endAngle - codeGap + angleOffset,
      radius: CODE_RADIUS,
      mode: isBottom ? 1 : 0,
    })

    // Name - truncate to fit within segment
    const nameText = text({
      text: (acc.issuer || acc.name || 'Account').slice(0, 10),
      text_size: NAME_SIZE,
      color: 0xFFFFFF,
      start_angle: startAngle + angleOffset,
      end_angle: endAngle + angleOffset,
      radius: NAME_RADIUS,
      mode: isBottom ? 1 : 0,
    })

    codeWidgets.push({ dark1, main1, dark2, main2, nameText, acc, isBottom })
  })

  // Center timer (gradient arc + black arc on top)
  const imgSize = size / 4 | 0
  const center = size / 2

  arc({
    w: imgSize / 2,
    h: imgSize / 2,
    line_width: 3,
    color: ARC_BG_COLOR,
    start_angle: 0,
    end_angle: 360,
  })

  arc({
    w: imgSize + 2,
    h: imgSize + 2,
    line_width: 5,
    color: ARC_BG_COLOR,
    start_angle: 0,
    end_angle: 360,
  })

  img({
    src: 'gradient_arc.png',
    x: 0,
    y: 0,
    w: imgSize,
    h: imgSize,
    center_x: center,
    center_y: center,
    angle: 0,
  })

  const timerArc = arc({
    w: imgSize + 2,
    h: imgSize + 2,
    line_width: 5,
    color: ARC_BG_COLOR,
    start_angle: -90,
    end_angle: 270,
  })

  return {
    updateTimer: (remaining) => {
      const rotation = -90 + (30 - remaining) * 12
      const coverage = (1 - remaining / 30) * 360
      timerArc.setProperty(prop.MORE, {
        start_angle: rotation,
        end_angle: rotation + coverage,
      })
    }
  }
}
