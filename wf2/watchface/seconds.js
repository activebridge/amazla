import * as hmUI from '@zos/ui'
import { px } from '@zos/utils'
import { size } from '../../pages/ui.js'

export function placeSecondsPointer() {
  const w = px(16) + 4  // +4 for 2px padding on each side
  const pivotY = px(240)  // pivot at screen center (half of 480 reference)

  hmUI.createWidget(hmUI.widget.TIME_POINTER, {
    second_centerX: size / 2,
    second_centerY: size / 2,
    second_posX: Math.floor(w / 2),
    second_posY: pivotY,
    second_path: 'pointer/seconds.png',
  })
}
