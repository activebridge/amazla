import { data_type, align, show_level } from '@zos/ui'
import { level, img, label, size } from '../../pages/ui.js'

export const Standing = (labelsEnabled) => {
  const o = size / 2 - 20
  const x = Math.round(o * 0.5)
  const y = Math.round(o * 0.866)

  if (labelsEnabled) label({ x: x - 56, y: y + 18, w: 100, h: 36, type: data_type.STAND, align_h: align.RIGHT, h_space: -4, show_level: show_level.ONLY_NORMAL })
  img({ x, y, w: 36, h: 36, src: 'status/standing/gray.png', show_level: show_level.ONLY_NORMAL })
  level({ x, y, w: 36, h: 36, image_array: Array.from({ length: 5 }, function(_, i) { return 'status/standing/' + i + '.png' }), image_length: 5, type: data_type.STAND, show_level: show_level.ONLY_NORMAL })
}
