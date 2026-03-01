import * as hmUI from '@zos/ui'
import { click, width, height } from '../../pages/ui.js'
import { s, dotPos } from './utils.js'

export function placeZones() {
  var iconSize = Math.round(36 * s)
  var zoneSize = iconSize * 2

  // Center zone - Weather
  click({
    x: 0,
    y: Math.round(70 * s),
    w: Math.round(300 * s),
    h: Math.round(150 * s),
    src: '',
    type: hmUI.data_type.WEATHER_CURRENT
  })

  // Outer icons
  var zones = [
    { hour: 1, type: hmUI.data_type.HEART },
    { hour: 2, type: hmUI.data_type.STEP },
    { hour: 4, type: hmUI.data_type.CAL },
    { hour: 5, type: hmUI.data_type.PAI_WEEKLY },
    { hour: 7, type: hmUI.data_type.BATTERY },
    { hour: 8, type: hmUI.data_type.DAY },
    { hour: 9, type: hmUI.data_type.ALARM_CLOCK },
    { hour: 11, type: hmUI.data_type.WEATHER_CURRENT },
  ]

  for (var i = 0; i < zones.length; i++) {
    var dp = dotPos(zones[i].hour)
    click({
      x: dp.x,
      y: dp.y,
      w: zoneSize,
      h: zoneSize,
      src: '',
      type: zones[i].type
    })
  }
}
