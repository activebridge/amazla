import * as hmUI from '@zos/ui'
import { level, img, label, size } from '../../pages/ui.js'

export const Calories = (labelsEnabled) => {
  const o = size / 2 - 20
  const x = Math.round(o * 0.866)
  const y = Math.round(o * 0.5)

  if (labelsEnabled) label({ x: x - 56, y: y + 4, w: 100, h: 36, type: hmUI.data_type.CAL, align_h: hmUI.align.RIGHT, h_space: -4 })
  img({ x, y, w: 36, h: 36, src: 'calories/gray.png' })
  level({ x, y, w: 36, h: 36, image_array: Array.from({ length: 5 }, function(_, i) { return 'calories/' + i + '.png' }), image_length: 5, type: hmUI.data_type.CAL })
}
