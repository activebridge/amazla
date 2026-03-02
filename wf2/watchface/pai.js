import * as hmUI from '@zos/ui'
import { level, size } from '../../pages/ui.js'

export const placePaiIcon = () => {
  const o = size / 2 - 20
  const x = Math.round(o * 0.5)
  const y = Math.round(o * 0.866)
  const sz = 36

  // image_length=105 maps PAI [0,525] as floor(pai/5):
  // red 0-5 (PAI 0-29), yellow 6-9 (30-49), blue 10-19 (50-99), green 20-104 (100+)
  var images = []
  for (var i = 0; i < 6; i++)  images.push('pai/red.png')
  for (var i = 0; i < 4; i++)  images.push('pai/yellow.png')
  for (var i = 0; i < 10; i++) images.push('pai/blue.png')
  for (var i = 0; i < 85; i++) images.push('pai/green.png')

  level({ x, y, w: sz, h: sz, image_array: images, image_length: 105, type: hmUI.data_type.PAI_WEEKLY })
}
