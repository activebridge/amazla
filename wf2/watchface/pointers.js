import * as hmUI from '@zos/ui'
import { px } from '@zos/utils'
import { size } from '../../pages/ui.js'

export function Pointers(mode) {
  // mode: 'all' | 'hm' | 'seconds'
  const showHM      = mode === 'all' || mode === 'hm'
  const showSeconds = mode === 'all' || mode === 'seconds'

  const w = px(16) + 4
  const pivotY = px(240)
  // posX = half of image width in design px: circle_r*2+8 = 10*2+8 = 28 → px(14)
  // posY = pivot distance from image top in design px
  const mPosX = 14
  const mh = 170
  const hPosX = 14
  const hh = 85

  hmUI.createWidget(hmUI.widget.TIME_POINTER, {
    hour_centerX: size / 2,
    hour_centerY: size / 2,
    hour_posX: hPosX,
    hour_posY: hh,
    hour_path: showHM ? 'pointer/hour.png' : '',
    minute_centerX: size / 2,
    minute_centerY: size / 2,
    minute_posX: mPosX,
    minute_posY: mh,
    minute_path: showHM ? 'pointer/minute.png' : '',
    second_centerX: size / 2,
    second_centerY: size / 2,
    second_posX: Math.floor(w / 2),
    second_posY: pivotY,
    second_path: showSeconds ? 'pointer/seconds.png' : '',
    show_level: hmUI.show_level.ONLY_NORMAL,
  })
}
