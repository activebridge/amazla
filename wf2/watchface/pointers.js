import { px } from '@zos/utils'
import { timePointer } from '../../pages/ui.js'
import { show_level } from '@zos/ui'

export function Pointers(mode) {
  // mode: 'all' | 'hm' | 'seconds'
  const showHM      = mode === 'all' || mode === 'hm'
  const showSeconds = mode === 'all' || mode === 'seconds'

  const w = px(16) + 4
  const pivotY = px(240)

  timePointer({
    hour_posX:   14,
    hour_posY:   85,
    minute_posX: 14,
    minute_posY: 170,
    second_posX: Math.floor(w / 2), second_posY: pivotY,
    hour_path:   showHM      ? 'pointer/hour.png'    : '',
    minute_path: showHM      ? 'pointer/minute.png'  : '',
    second_path: showSeconds ? 'pointer/seconds.png' : '',
  })

  timePointer({
    hour_posX:   14,
    hour_posY:   85,
    minute_posX: 14,
    minute_posY: 170,
    second_posX: Math.floor(w / 2), second_posY: pivotY,
    hour_path:   showHM      ? 'pointer/hour.png'    : '',
    minute_path: showHM      ? 'pointer/minute.png'  : '',
    second_path: '',
    show_level: show_level.ONLY_AOD,
  })
}
