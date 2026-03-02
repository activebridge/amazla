import * as hmUI from '@zos/ui'
import { level, size } from '../../pages/ui.js'

export const placePaiIcon = () => {
  const o = size / 2 - 20
  const x = Math.round(o * 0.5)     // cos(60) for 5 o'clock
  const y = Math.round(o * 0.866)   // sin(60) for 5 o'clock
  const sz = 36

  // Map 40 buckets to our 4 unique colored files
  var images = []
  for (var i = 0; i < 3; i++) images.push('pai/red.png')    // 0-30 PAI
  for (var i = 0; i < 2; i++) images.push('pai/yellow.png') // 30-50 PAI
  for (var i = 0; i < 5; i++) images.push('pai/blue.png')   // 50-100 PAI
  for (var i = 0; i < 30; i++) images.push('pai/green.png') // 100-400 PAI

  // Using 'level' helper from ui.js as it provides IMG_LEVEL widget
  level({
    x: x,
    y: y,
    w: sz,
    h: sz,
    image_array: images,
    image_length: 40,
    type: hmUI.data_type.PAI_WEEKLY,
  })
}
