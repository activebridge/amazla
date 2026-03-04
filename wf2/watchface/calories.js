import * as hmUI from '@zos/ui'
import { level, img, label, size } from '../../pages/ui.js'

export const Calories = () => {
  const o = size / 2 - 20
  const x = Math.round(o * 0.866)
  const y = Math.round(o * 0.5)

  img({ x, y, w: 36, h: 36, src: 'calories/gray.png' })
  level({ x, y, w: 36, h: 36, image_array: Array.from({ length: 5 }, function(_, i) { return 'calories/' + i + '.png' }), image_length: 5, type: hmUI.data_type.CAL })
  label({ x: x - 30, y: y + 4, w: 70, h: 24, type: hmUI.data_type.CAL, align: hmUI.align.RIGHT })
}
