import { align, data_type, show_level } from '@zos/ui'
import { alarm, dnd, lock, disconnect, img, label, width, height, size, circle } from '../../pages/ui.js'

export const placeStatusIcons = (labelsEnabled) => {
  const o = size / 2 - 20

  labelsEnabled && label({
    x: 72 - o, y: 4, w: 120, h: 36,
    align_h: align.LEFT,
    type: data_type.ALARM_CLOCK,
    dot_image: 'label-font/colon.png',
    invalid_image: 'label-font/minus.png',
    show_level: show_level.ONLY_NORMAL,
  })

  // 9 o'clock: Alarm
  img({ x: -o, y: 0, w: 36, h: 36, src: 'status/alarm_gray.png', show_level: show_level.ONLY_NORMAL })
  alarm({ x: -o, y: 0, w: 36, h: 36, show_level: show_level.ONLY_NORMAL })

  // Large Curved Top-Side Disconnect Bar
  disconnect({
    x: 0,
    y: -height / 2.35,
    w: width,
    h: Math.floor(height / 4),
    src: 'status/disconnect_large.png',
    show_level: show_level.ONLY_NORMAL
  })

  circle({ y: -o, radius: 5, color: 0xFFFFFF, show_level: show_level.ONLY_NORMAL })
  // 12 o'clock: DND and Lock
  dnd({ x: 0, y: -o, w: 36, h: 36, show_level: show_level.ONLY_NORMAL })
  lock({ x: 0, y: -o, w: 36, h: 36, show_level: show_level.ONLY_NORMAL })
}
