import * as hmUI from '@zos/ui'
import { s, pos, dotPos } from './utils.js'

export function placeWeekdayIcon() {
  var iconSize = Math.round(36 * s)
  var dp = dotPos(10)
  var p = pos(dp.x, dp.y, iconSize, iconSize)

  hmUI.createWidget(hmUI.widget.IMG_LEVEL, {
    x: p.x, y: p.y, w: iconSize, h: iconSize,
    image_array: Array.from({ length: 7 }, function(_, i) { return 'weekday/' + i + '.png' }),
    image_length: 7,
    type: hmUI.data_type.DATE_W,
  })
}
