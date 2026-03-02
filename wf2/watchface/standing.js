import * as hmUI from '@zos/ui'
import { level, img, size } from '../../pages/ui.js'

export const Standing = () => {
  const o = size / 2 - 20
  const x = Math.round(o * 0.5)    // cos(60°) for hour 5
  const y = Math.round(o * 0.866)  // sin(60°) for hour 5

  img({ x, y, w: 36, h: 36, src: 'status/standing/gray.png' })
  level({ x, y, w: 36, h: 36, image_array: Array.from({ length: 5 }, function(_, i) { return 'status/standing/' + i + '.png' }), image_length: 5, type: hmUI.data_type.STAND })
}
