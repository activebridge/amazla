import { Time } from '@zos/sensor'
import * as hmUI from '@zos/ui'
import { px } from '@zos/utils'
import { width, height, size, date } from '../../pages/ui.js'

const BG_IMGS = [
  'date/blue.png',   // Jan
  'date/blue.png',   // Feb
  'date/green.png',  // Mar
  'date/green.png',  // Apr
  'date/green.png',  // May
  'date/yellow.png', // Jun
  'date/yellow.png', // Jul
  'date/yellow.png', // Aug
  'date/red.png',    // Sep
  'date/red.png',    // Oct
  'date/red.png',    // Nov
  'date/blue.png'    // Dec
]

const MONTH_IMGS = [
  'month-label/0.png',
  'month-label/1.png',
  'month-label/2.png',
  'month-label/3.png',
  'month-label/4.png',
  'month-label/5.png',
  'month-label/6.png',
  'month-label/7.png',
  'month-label/8.png',
  'month-label/9.png',
  'month-label/10.png',
  'month-label/11.png'
]

export function placeDateIcon(labelsEnabled) {
  // 6 o'clock position at ~27% of radius (~130px on 480px screen)
  const sz = px(40)
  const r = Math.floor(size / 2) - 4 - Math.floor(sz / 2)

  // Month label above date square using date() helper (auto-updates)
  labelsEnabled && date({
    x: 0,
    y: px(height / 2 - 72),
    w: 29,
    h: 76,
    align_h: hmUI.align.BOTTOM,
    month_is_character: true,
    day_en_array: [],
    month_en_array: MONTH_IMGS,
    month_sc_array: MONTH_IMGS,
    month_tc_array: MONTH_IMGS,
  })

  // Background: gradient rounded square colored by month using date() helper (auto-updates)
  date({
    x: 0,
    y: height / 2 - 22,
    // monthCenterX: width - 40,
    w: sz,
    h: sz,
    month_is_character: true,
    day_en_array: [],
    month_en_array: BG_IMGS,
    month_sc_array: BG_IMGS,
    month_tc_array: BG_IMGS,
  })


  // Day number centered in square
  var digitW = px(23) * 2 - 5
  var digitH = px(28)
  date({
    x: 0,
    y: px(height / 2 - 33),
    w: 40,
    h: 0,
    month_en_array: [],
    day_zero: 1,
    day_space: -8,
    day_en_array: Array.from({ length: 10 }, function(_, i) { return 'date-font/' + i + '.png' }),
  })
}

