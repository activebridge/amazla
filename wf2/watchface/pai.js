import { data_type, align, show_level } from '@zos/ui'
import { level, label, size, img } from '../../pages/ui.js'

// image_length=105 maps PAI [0,525] as floor(pai/5):
// red 0-5 (PAI 0-29), yellow 6-9 (30-49), blue 10-19 (50-99), green 20-104 (100+)
var image_array = []
for (var i = 0; i < 6; i++)  image_array.push('pai/red.png')
for (var i = 0; i < 4; i++)  image_array.push('pai/yellow.png')
for (var i = 0; i < 10; i++) image_array.push('pai/blue.png')
for (var i = 0; i < 85; i++) image_array.push('pai/green.png')

export const Pai = (labelsEnabled) => {
  const o = size / 2 - 20
  const x = Math.round(o * 1)      // cos(0°) for hour 3
  const y = 0                       // sin(0°) for hour 3

  if (labelsEnabled) label({ x: x - 60, y: y + 4, w: 100, h: 36, type: data_type.PAI_WEEKLY, align_h: align.RIGHT, h_space: -4, show_level: show_level.ONLY_NORMAL })
  img({ x, y, w: 36, h: 36, src: 'pai/red.png', show_level: show_level.ONLY_NORMAL })
  level({ x, y, w: 36, h: 36, image_array, image_length: 105, type: data_type.PAI_WEEKLY, show_level: show_level.ONLY_NORMAL })
}
