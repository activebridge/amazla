import * as hmUI from '@zos/ui'
import { s, pos, dotPos } from './utils.js'

export function placeCaloriesIcon() {
  var iconSize = Math.round(36 * s)
  var dp = dotPos(4)
  var p = pos(dp.x, dp.y, iconSize, iconSize)

  hmUI.createWidget(hmUI.widget.IMG, {
    x: p.x, y: p.y, w: iconSize, h: iconSize,
    src: 'calories/gray.png',
  })

  hmUI.createWidget(hmUI.widget.IMG_LEVEL, {
    x: p.x, y: p.y, w: iconSize, h: iconSize,
    image_array: Array.from({ length: 5 }, function(_, i) { return 'calories/' + i + '.png' }),
    image_length: 5,
    type: hmUI.data_type.CAL,
  })
}
