import * as hmUI from '@zos/ui'
import { alarm, dnd, lock, disconnect, img, width, height, size } from '../../pages/ui.js'

export const placeStatusIcons = () => {
  const o = size / 2 - 20

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

  // 12 o'clock: DND and Lock
  dnd({ x: 0, y: -o, w: 36, h: 36 })
  lock({ x: 0, y: -o, w: 36, h: 36 })
}
