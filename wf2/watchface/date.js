import { Time } from '@zos/sensor'
import * as hmUI from '@zos/ui'
import { px } from '@zos/utils'
import { width, height, size } from '../../pages/ui.js'

export function placeDateIcon(labelsEnabled) {
  // 6 o'clock position at ~27% of radius (~130px on 480px screen)
  const sz = px(40)
  const r = Math.floor(size / 2) - 4 - Math.floor(sz / 2)
  const cx = Math.floor(width / 2)
  const cy = Math.floor(height / 2) + r
  const x = cx - Math.floor(sz / 2)
  const y = cy - Math.floor(sz / 2)

  // Month label above date square using IMG_DATE with character images (auto-updates)
  var monthImgs = Array.from({ length: 12 }, function(_, i) { return 'month-label/' + i + '.png' })
  labelsEnabled && hmUI.createWidget(hmUI.widget.IMG_DATE, {
    month_startX: cx - 14,
    month_startY: y - 68,
    month_is_character: true,
    month_en_array: monthImgs,
    month_sc_array: monthImgs,
    month_tc_array: monthImgs,
  })

  // Background: gradient rounded square colored by week
  var day = new Time().getDate()
  var src = day <= 7 ? 'date/blue.png' : day <= 14 ? 'date/green.png' : day <= 21 ? 'date/yellow.png' : 'date/red.png'
  hmUI.createWidget(hmUI.widget.IMG, { x, y, w: sz, h: sz, src, auto_scale: true })

  // Day number centered in square
  var digitW = px(23) * 2 - 5
  var digitH = px(28)
  hmUI.createWidget(hmUI.widget.IMG_DATE, {
    day_startX: x + Math.floor((sz - digitW) / 2) + px(2),
    day_startY: y + Math.floor((sz - digitH) / 2) + px(3),
    day_zero: 1,
    day_space: -8,
    day_en_array: Array.from({ length: 10 }, function(_, i) { return 'date-font/' + i + '.png' }),
  })
}
