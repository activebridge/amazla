import * as hmUI from '@zos/ui'
import { weekday } from '../../pages/ui.js'
import { s, dotPos } from './utils.js'

export function placeWeekdayIcon() {
  var iconSize = Math.round(36 * s)
  var dp = dotPos(10)

  weekday({
    x: dp.x,
    y: dp.y,
    w: iconSize,
    h: iconSize,
    folder: 'weekday'
  })
}
