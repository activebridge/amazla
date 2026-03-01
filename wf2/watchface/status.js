import * as hmUI from '@zos/ui'
import { alarm, disconnect, dnd, lock, img } from '../../pages/ui.js'
import { s, dotPos } from './utils.js'

export function placeStatusIcons() {
  var iconSize = Math.round(36 * s)
  var statuses = [
    { fn: alarm, hour: 9, gray: 'status/alarm_gray.png' },
    { fn: dnd, hour: 12 },
    { fn: function(p) { img({ x: p.x, y: p.y, w: p.w, h: p.h, src: 'status/disconnect.png' }) }, hour: 3 }, // TODO: revert to disconnect
    { fn: lock, hour: 6 },
  ]
  for (var j = 0; j < statuses.length; j++) {
    var dp = dotPos(statuses[j].hour)
    if (statuses[j].gray) {
      img({ x: dp.x, y: dp.y, w: iconSize, h: iconSize, src: statuses[j].gray })
    }
    statuses[j].fn({ x: dp.x, y: dp.y, w: iconSize, h: iconSize })
  }
}
