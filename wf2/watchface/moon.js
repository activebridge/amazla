import * as hmUI from '@zos/ui'
import { level, label, size } from '../../pages/ui.js'

var SUN_FONT = Array.from({ length: 10 }, function(_, i) { return 'sun-font/' + i + '.png' })

export const Moon = (labelsEnabled) => {
  const o = size / 2 - 20
  const x = Math.round(o * -0.866)  // cos(150°) for hour 8
  const y = Math.round(o * 0.5)     // sin(150°) for hour 8

  labelsEnabled && label({
    x: x + 72, y: y + 4, w: 120, h: 36,
    align_h: hmUI.align.LEFT,
    type: hmUI.data_type.SUN_CURRENT,
    dot_image: 'label-font/colon.png',
    invalid_image: 'label-font/minus.png',
    h_space: -4,
  })

  level({ x, y, w: 36, h: 36, image_array: Array.from({ length: 30 }, function(_, i) { return 'moon/' + i + '.png' }), image_length: 30, type: hmUI.data_type.MOON })
}
