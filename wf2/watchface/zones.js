import * as hmUI from '@zos/ui'
import { px } from '@zos/utils'
import { click, size } from '../../pages/ui.js'
import { launchApp, SYSTEM_APP_CALENDAR } from '@zos/router'

export function placeZones() {
  const sz = px(36)
  const zoneSize = sz * 2
  const r = Math.floor(size / 2) - 4 - Math.floor(sz / 2)

  click({
    x: 0,
    y: px(70),
    w: px(300),
    h: px(150),
    src: '',
    type: hmUI.data_type.WEATHER_CURRENT
  })

  var zones = [
    { hour: 1,  type: hmUI.data_type.HEART },
    { hour: 2,  type: hmUI.data_type.STEP },
    { hour: 3,  type: hmUI.data_type.PAI_WEEKLY },
    { hour: 4,  type: hmUI.data_type.CAL },
    { hour: 5,  type: hmUI.data_type.STAND },
    { hour: 6,  type: hmUI.data_type.DAY },
    { hour: 7,  type: hmUI.data_type.BATTERY },
    { hour: 8,  type: hmUI.data_type.MOON },
    { hour: 9,  type: hmUI.data_type.ALARM_CLOCK },
    { hour: 11, type: hmUI.data_type.WEATHER_CURRENT },
  ]

  for (var i = 0; i < zones.length; i++) {
    var angle = (zones[i].hour * 30 - 90) * Math.PI / 180
    click({
      x: Math.round(r * Math.cos(angle)),
      y: Math.round(r * Math.sin(angle)),
      w: zoneSize,
      h: zoneSize,
      src: '',
      type: zones[i].type
    })
  }

  // Date icon at 6 o'clock → open calendar
  var dateSz = px(40)
  var dateR = Math.floor(size / 2) - 4 - Math.floor(dateSz / 2)
  click({
    x: 0,
    y: dateR,
    w: dateSz,
    h: dateSz,
    src: '',
    click_func: function() {
      try { launchApp({ appId: SYSTEM_APP_CALENDAR, native: true }) } catch(e) {}
    }
  })
}
