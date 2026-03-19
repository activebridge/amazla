import { data_type, align, show_level } from '@zos/ui'
import { level, label, size } from '../../pages/ui.js'

export const Battery = (labelsEnabled) => {
  const o = size / 2 - 20
  const x = Math.round(o * -0.5)
  const y = Math.round(o * 0.866)

  if (labelsEnabled) label({ x: x + 40, y: y + 18, w: 70, h: 36, type: data_type.BATTERY, align_h: align.LEFT, h_space: -4, show_level: show_level.ONLY_NORMAL })
  level({ x, y, w: 36, h: 36, image_array: Array.from({ length: 5 }, function(_, i) { return 'battery/' + i + '.png' }), image_length: 5, type: data_type.BATTERY, show_level: show_level.ONLY_NORMAL })
}
