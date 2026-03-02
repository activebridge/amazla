import * as hmUI from '@zos/ui'
import { level, size } from '../../pages/ui.js'

export const Weather = () => {
  const o = size / 2 - 20
  const x = Math.round(o * -0.5)    // cos(240°) for hour 11
  const y = Math.round(o * -0.866)  // sin(240°) for hour 11

  level({ x, y, w: 36, h: 36, image_array: Array.from({ length: 29 }, function(_, i) { return 'weather-icons/' + i + '.png' }), image_length: 29, type: hmUI.data_type.WEATHER_CURRENT })
}
