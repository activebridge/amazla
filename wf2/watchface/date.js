import * as hmUI from '@zos/ui'
import { level, size } from '../../pages/ui.js'

export function placeDateIcon() {
  const sz = 36
  const o = size / 2 - 20
  const x = Math.round(o)  // cos(0°) for 3 o'clock
  const y = 0              // sin(0°) for 3 o'clock

  var bgImages = []
  for (var i = 0; i < 7; i++)  bgImages.push('date/blue.png')    // days 1–7
  for (var i = 0; i < 7; i++)  bgImages.push('date/green.png')   // days 8–14
  for (var i = 0; i < 7; i++)  bgImages.push('date/yellow.png')  // days 15–21
  for (var i = 0; i < 10; i++) bgImages.push('date/red.png')     // days 22–31

  level({
    x, y, w: sz, h: sz,
    image_array: bgImages,
    image_length: 31,
    type: hmUI.data_type.DATE_DAY,
  })
}
