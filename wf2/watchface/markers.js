import * as hmUI from '@zos/ui'
import { s, pos } from './utils.js'

export function placeMarkers() {
  var size = 10
  for (var i = 0; i < 12; i++) {
    var angle = (i * 30 - 90) * Math.PI / 180
    var r = 240 * s - 4 - size / 2
    var p = pos(Math.round(r * Math.cos(angle)), Math.round(r * Math.sin(angle)), size, size)
    hmUI.createWidget(hmUI.widget.IMG, {
      x: p.x,
      y: p.y,
      w: size,
      h: size,
      src: 'dot.png',
    })
  }
}
