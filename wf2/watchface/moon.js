import * as hmUI from '@zos/ui'
import { level, size } from '../../pages/ui.js'

export function placeMoonIcon() {
  const w = h = 36
  const o = size / 2 - 20
  const x = Math.round(o * -0.866)  // cos(150°) for 8 o'clock
  const y = Math.round(o * 0.5)     // sin(150°) for 8 o'clock
  const image_array = Array.from({ length: 30 }, function(_, i) { return 'moon/' + i + '.png' })
  const image_length = 30
  const type = hmUI.data_type.MOON

  level({ x, y, w, h, image_array, image_length, type })
}
