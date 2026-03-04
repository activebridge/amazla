import * as hmUI from '@zos/ui'
import { px } from '@zos/utils'
import { click, button, size } from '../../pages/ui.js'
import { launchApp, SYSTEM_APP_CALENDAR, SYSTEM_APP_WORLD_CLOCK, SYSTEM_APP_SETTING } from '@zos/router'

export function placeZones() {
  const sz = px(36)
  const zoneSize = sz * 2
  const r = Math.floor(size / 2) - 4 - Math.floor(sz / 2)

  var zones = [
    { hour: 1,  type: hmUI.data_type.HEART },
    { hour: 2,  type: hmUI.data_type.STEP },
    { hour: 3,  type: hmUI.data_type.PAI_WEEKLY },
    { hour: 4,  type: hmUI.data_type.CAL },
    { hour: 5,  type: hmUI.data_type.STAND },
    { hour: 7,  type: hmUI.data_type.BATTERY },
    { hour: 8,  type: hmUI.data_type.MOON },
    { hour: 9,  type: hmUI.data_type.ALARM_CLOCK },
    { hour: 11, type: hmUI.data_type.WEATHER },
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

  // 12 o'clock → open settings
  button({
    x: 0,
    y: -r,
    w: zoneSize,
    h: zoneSize,
    src: '_',
    click_func: function() {
      launchApp({ appId: SYSTEM_APP_SETTING, native: true })
    }
  })

  // Weekday at 10 o'clock → open world clock
  var wdO = Math.floor(size / 2) - 20
  button({
    x: Math.round(wdO * -0.866),
    y: Math.round(wdO * -0.5),
    w: zoneSize,
    h: zoneSize,
    src: '_',
    click_func: function() {
      launchApp({ appId: SYSTEM_APP_WORLD_CLOCK, native: true })
    }
  })

  // Date at 6 o'clock → open calendar
  var dateR = Math.floor(size / 2) - 4 - Math.floor(sz / 2)
  button({
    x: 0,
    y: dateR,
    w: zoneSize,
    h: zoneSize,
    src: '_',
    click_func: function() {
      console.log('calendar tap')
      launchApp({ appId: SYSTEM_APP_CALENDAR, native: true })
    }
  })
}
