import * as hmUI from '@zos/ui'
import { s, pos } from './utils.js'

export function placeSecondsPointer() {
  var w = Math.round(16 * s)
  var h = Math.round(100 * s)
  var p = pos(0, 0, w, h)
  hmUI.createWidget(hmUI.widget.IMG_TIME, {
    second_startX: p.x,
    second_startY: p.y,
    second_centerX: Math.floor(w / 2),
    second_centerY: Math.floor(h / 2),
    second_src: 'pointer/seconds.png',
  })
}
