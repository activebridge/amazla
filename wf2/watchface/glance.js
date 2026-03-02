import * as hmUI from '@zos/ui'
import { date, weekday, temperature, weather } from '../../pages/ui.js'
import { px } from '@zos/utils'

// Y offsets from center (reference 480px)
var Y1 = 50
var Y2 = 72

export function placeGlance() {
  var pipeW = 15
  var gap = 10
  var refW_Date = 140
  var refW_Week = 180
  var refW_Temp = 100
  var refW_Weather = 180

  // Line 1: MAR, 31| Saturday
  date({
    x: 0,
    y: 60,
    w: 100,
    h: px(36),
    align_h: hmUI.align.RIGHT,
    month_is_character: true,
    month_en_array: Array.from({ length: 12 }, (_, i) => `glance-month/${i}.png`),
    month_unit_en: '', 
    day_follow: 1,
    day_en_array: Array.from({ length: 10 }, (_, i) => `glance/${i}.png`),
    day_zero: 0,
    day_space: px(4),
    show_level: hmUI.show_level.ONLY_NORMAL
  })

  weekday({
    x: 0,
    y: 20,
    w: px(refW_Week),
    h: px(36),
    folder: 'glance-week',
    align_h: hmUI.align.LEFT,
    show_level: hmUI.show_level.ONLY_NORMAL
  })

  // Line 2: 12˚| Cloudy
  temperature({
    x: 0,
    y: -50,
    w: px(refW_Temp),
    h: px(36),
    align_h: hmUI.align.RIGHT,
    font_array: Array.from({ length: 10 }, (_, i) => `glance/${i}.png`),
    unit_en: 'glance/degree.png',
    unit_sc: 'glance/degree.png',
    negative_image: 'glance/dash.png',
    show_level: hmUI.show_level.ONLY_NORMAL
  })

  weather({
    x: 0,
    y: -20,
    w: px(refW_Weather),
    h: px(36),
    folder: 'weather',
    align_h: hmUI.align.LEFT,
    show_level: hmUI.show_level.ONLY_NORMAL
  })
}

export function updateGlance() {}
