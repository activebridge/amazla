import { weekday } from '../../pages/ui.js'
import { px } from '@zos/utils'
import { size } from '../../pages/ui.js'

export function placeWeekdayIcon() {
  const sz = px(36)
  const angle = (10 * 30 - 90) * Math.PI / 180
  const r = Math.floor(size / 2) - 4 - Math.floor(sz / 2)

  weekday({
    x: Math.round(r * Math.cos(angle)),
    y: Math.round(r * Math.sin(angle)),
    w: sz,
    h: sz,
    folder: 'weekday'
  })
}
