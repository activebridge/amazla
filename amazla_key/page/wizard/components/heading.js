import * as hmUI from '@zos/ui'
import { text, width, height } from '../../../../pages/ui.js'

// Heading renders a large centered title text.
// y is an absolute pixel position (defaults to ~38% down the screen).
export const Heading = ({ label, y }) => {
  const h = 48
  const yPos = y !== undefined ? y : (height * 0.38 | 0)
  return text({
    centered: false,
    x: 0,
    y: yPos,
    w: width,
    h,
    text: label,
    text_size: 28,
    color: 0xffffff,
    align_h: hmUI.align.CENTER_H,
    align_v: hmUI.align.CENTER_V,
  })
}
