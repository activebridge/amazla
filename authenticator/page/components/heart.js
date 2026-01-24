import { text, width } from './../../../pages/ui.js'
import { align } from '@zos/ui'

export const Heart = (y, size = 100) => {
  // Blue top half, yellow bottom half (Ukrainian flag colors)
  text({ text: '♡', x: 0, y, h: 64, text_size: size, color: 0x0057B7, centered: false, align_v: align.TOP })
  text({ text: '♡', x: 0, y: y + 64, h: 80, text_size: size, color: 0xFFD700, centered: false, align_v: align.BOTTOM })
}
