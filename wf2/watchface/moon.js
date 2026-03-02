import * as hmUI from '@zos/ui'
import { level, size } from '../../pages/ui.js'

export const Moon = () => {
  const o = size / 2 - 20
  const x = Math.round(o * -0.866)  // cos(150°) for hour 8
  const y = Math.round(o * 0.5)     // sin(150°) for hour 8

  level({ x, y, w: 36, h: 36, image_array: Array.from({ length: 30 }, function(_, i) { return 'moon/' + i + '.png' }), image_length: 30, type: hmUI.data_type.MOON })
}
