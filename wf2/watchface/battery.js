import * as hmUI from '@zos/ui'
import { level, label, size } from '../../pages/ui.js'

export const Battery = () => {
  const o = size / 2 - 20
  const x = Math.round(o * -0.5)
  const y = Math.round(o * 0.866)

  level({ x, y, w: 36, h: 36, image_array: Array.from({ length: 5 }, function(_, i) { return 'battery/' + i + '.png' }), image_length: 5, type: hmUI.data_type.BATTERY })
  label({ x: x + 30, y: y - 4, w: 70, h: 24, type: hmUI.data_type.BATTERY, align: hmUI.align.LEFT })
}
