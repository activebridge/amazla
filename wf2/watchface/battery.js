import * as hmUI from '@zos/ui'
import { s, pos, dotPos } from './utils.js'

export function placeBatteryIcon() {
  var iconSize = Math.round(36 * s)
  var dp = dotPos(7)
  var p = pos(dp.x, dp.y, iconSize, iconSize)

  hmUI.createWidget(hmUI.widget.IMG_LEVEL, {
    x: p.x, y: p.y, w: iconSize, h: iconSize,
    image_array: Array.from({ length: 5 }, function(_, i) { return 'battery/' + i + '.png' }),
    image_length: 5,
    type: hmUI.data_type.BATTERY,
  })
}
