import { circle, size } from '../../pages/ui.js'

export function placeMarkers() {
  var o = size / 2 - 10
  var p = { radius: 5, color: 0xffffff, alpha: 255 }
  circle({ ...p, y: -o })
  circle({ ...p, x:  o })
  circle({ ...p, y:  o })
  circle({ ...p, x: -o })
}
