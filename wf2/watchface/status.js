import * as hmUI from '@zos/ui'
import { alarm, dnd, lock, disconnect, img, label, width, height, size, circle } from '../../pages/ui.js'

export const placeStatusIcons = (labelsEnabled) => {
  const o = size / 2 - 20

  labelsEnabled && label({ x: 52 - o, y: 4, w: 80, h: 36, type: hmUI.data_type.ALARM_CLOCK, align_h: hmUI.align.LEFT, h_space: -4 })
  // 9 o'clock: Alarm
  img({ x: -o, y: 0, w: 36, h: 36, src: 'status/alarm_gray.png' })
  alarm({ x: -o, y: 0, w: 36, h: 36 })

  // Large Curved Top-Side Disconnect Bar
  disconnect({
    x: 0,
    y: -25,
    w: width,
    h: Math.floor(height / 4),
    src: 'status/disconnect_large.png',
    centered: false,
    show_level: hmUI.show_level.ONLY_NORMAL
  })

  circle({ y: -o + 5, radius: 5, color: 0xFFFFFF })
  // 12 o'clock: DND and Lock
  dnd({ x: 0, y: -o, w: 36, h: 36 })
  lock({ x: 0, y: -o, w: 36, h: 36 })
}
