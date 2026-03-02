import * as hmUI from '@zos/ui'
import { HeartRate } from '@zos/sensor'
import { px } from '@zos/utils'
import { width, height, size } from '../../pages/ui.js'

var heartIcon
var hrSensor = new HeartRate()

export function updateHeart() {
  var hr = hrSensor.getCurrent() || 0
  var zone = hr < 1 ? 0 : hr < 100 ? 1 : hr < 120 ? 2 : hr < 140 ? 3 : hr < 160 ? 4 : 5
  heartIcon.setProperty(hmUI.prop.MORE, { src: 'status/heart/' + zone + '.png' })
}

export function placeHeartIcon() {
  const sz = px(36)
  const angle = (1 * 30 - 90) * Math.PI / 180
  const r = Math.floor(size / 2) - 4 - Math.floor(sz / 2)
  const x = Math.floor((width - sz) / 2 + Math.round(r * Math.cos(angle)))
  const y = Math.floor((height - sz) / 2 + Math.round(r * Math.sin(angle)))

  heartIcon = hmUI.createWidget(hmUI.widget.IMG, {
    x, y, w: sz, h: sz,
    src: 'status/heart/0.png',
    angle: 30,
    center_x: Math.floor(sz / 2),
    center_y: Math.floor(sz / 2),
  })
  hrSensor.onCurrentChange(updateHeart)
}
