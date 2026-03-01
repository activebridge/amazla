import * as hmUI from '@zos/ui'
import { s, pos, dotPos } from './utils.js'

export function placeDateIcon() {
  var iconSize = Math.round(36 * s)
  var dp = dotPos(8)
  var p = pos(dp.x, dp.y, iconSize, iconSize)

  hmUI.createWidget(hmUI.widget.IMG_LEVEL, {
    x: p.x, y: p.y, w: iconSize, h: iconSize,
    image_array: Array.from({ length: 30 }, function(_, i) { return 'date/moon_' + i + '.png' }),
    image_length: 30,
    type: hmUI.data_type.MOON,
  })
}
