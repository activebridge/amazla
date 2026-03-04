import * as hmUI from '@zos/ui'
import { level, label, size } from '../../pages/ui.js'

var SUN_FONT = Array.from({ length: 10 }, function(_, i) { return 'sun-font/' + i + '.png' })

export const Moon = () => {
  const o = size / 2 - 20
  const x = Math.round(o * -0.866)  // cos(150°) for hour 8
  const y = Math.round(o * 0.5)     // sin(150°) for hour 8

  label({ x: x + 60, y: y - 11, w: 100, h: 36, type: hmUI.data_type.SUN_RISE, align_h: hmUI.align.LEFT,  h_space: -4, font_array: SUN_FONT, colon_en: 'sun-font/colon.png' })
  label({ x: x + 60, y: y + 22, w: 100, h: 36, type: hmUI.data_type.SUN_SET, align_h: hmUI.align.LEFT,  h_space: -4, font_array: SUN_FONT, colon_en: 'sun-font/colon.png' })
  level({ x, y, w: 36, h: 36, image_array: Array.from({ length: 30 }, function(_, i) { return 'moon/' + i + '.png' }), image_length: 30, type: hmUI.data_type.MOON })
}
