import * as hmUI from '@zos/ui'
import { level, img, size } from '../../pages/ui.js'

export const Steps = () => {
  const o = size / 2 - 20
  const x = Math.round(o * 0.866)   // cos(-30°) for hour 2
  const y = Math.round(o * -0.5)    // sin(-30°) for hour 2

  img({ x, y, w: 36, h: 36, src: 'steps/gray.png' })
  level({ x, y, w: 36, h: 36, image_array: Array.from({ length: 5 }, function(_, i) { return 'steps/' + i + '.png' }), image_length: 5, type: hmUI.data_type.STEP })
}
