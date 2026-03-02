import * as hmUI from '@zos/ui'
import { px } from '@zos/utils'
import { width, height, size } from '../../pages/ui.js'

export function placeBatteryIcon() {
  const sz = px(36)
  const angle = (7 * 30 - 90) * Math.PI / 180
  const r = Math.floor(size / 2) - 4 - Math.floor(sz / 2)
  const x = Math.floor((width - sz) / 2 + Math.round(r * Math.cos(angle)))
  const y = Math.floor((height - sz) / 2 + Math.round(r * Math.sin(angle)))

  hmUI.createWidget(hmUI.widget.IMG_LEVEL, {
    x, y, w: sz, h: sz,
    image_array: Array.from({ length: 5 }, function(_, i) { return 'battery/' + i + '.png' }),
    image_length: 5,
    type: hmUI.data_type.BATTERY,
  })
}
