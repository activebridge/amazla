import * as hmUI from '@zos/ui'
import { HeartRate } from '@zos/sensor'
import { s, pos, dotPos } from './utils.js'

var heartIcon
var hrSensor = new HeartRate()

export function updateHeart() {
  var hr = hrSensor.getCurrent() || 0
  var zone = hr < 1 ? 0 : hr < 100 ? 1 : hr < 120 ? 2 : hr < 140 ? 3 : hr < 160 ? 4 : 5
  heartIcon.setProperty(hmUI.prop.MORE, { src: 'status/heart/' + zone + '.png' })
}

export function placeHeartIcon() {
  var iconSize = Math.round(36 * s)
  var dp = dotPos(1)
  var hp = pos(dp.x, dp.y, iconSize, iconSize)
  heartIcon = hmUI.createWidget(hmUI.widget.IMG, {
    x: hp.x, y: hp.y, w: iconSize, h: iconSize,
    src: 'status/heart/0.png',
    angle: 30,
    center_x: Math.floor(iconSize / 2),
    center_y: Math.floor(iconSize / 2),
  })
  hrSensor.onCurrentChange(updateHeart)
}
