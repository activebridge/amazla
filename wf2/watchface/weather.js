import * as hmUI from '@zos/ui'
import { s, pos, dotPos } from './utils.js'

export function placeWeatherIcon() {
  var iconSize = Math.round(36 * s)
  var dp = dotPos(11)
  var wp = pos(dp.x, dp.y, iconSize, iconSize)

  hmUI.createWidget(hmUI.widget.IMG_LEVEL, {
    x: wp.x, y: wp.y, w: iconSize, h: iconSize,
    image_array: Array.from({ length: 29 }, function(_, i) { return 'weather-icons/' + i + '.png' }),
    image_length: 29,
    type: hmUI.data_type.WEATHER_CURRENT,
  })
}
