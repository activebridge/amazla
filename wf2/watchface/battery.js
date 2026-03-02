import * as hmUI from '@zos/ui'
import { level, size } from '../../pages/ui.js'

export const Battery = () => {
  const o = size / 2 - 20
  const x = Math.round(o * -0.5)    // cos(120°) for hour 7
  const y = Math.round(o * 0.866)   // sin(120°) for hour 7

  level({ x, y, w: 36, h: 36, image_array: Array.from({ length: 5 }, function(_, i) { return 'battery/' + i + '.png' }), image_length: 5, type: hmUI.data_type.BATTERY })
}
