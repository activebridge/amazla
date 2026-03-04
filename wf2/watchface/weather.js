import * as hmUI from '@zos/ui'
import { level, label, size } from '../../pages/ui.js'

export const Weather = (labelsEnabled) => {
  const o = size / 2 - 20
  const x = Math.round(o * -0.5)    // cos(240°) for hour 11
  const y = Math.round(o * -0.866)  // sin(240°) for hour 11

  if (labelsEnabled) label({ x: x + 36, y: y - 10, w: 70, h: 36, type: hmUI.data_type.WEATHER_CURRENT, h_space: -4, unit_en: 'label-font/degree.png' })
  level({ x, y, w: 36, h: 36, image_array: Array.from({ length: 29 }, function(_, i) { return 'weather/' + i + '.png' }), image_length: 29, type: hmUI.data_type.WEATHER })
}
