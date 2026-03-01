import * as hmUI from '@zos/ui'
import { weather } from '../../pages/ui.js'
import { s, dotPos } from './utils.js'

export function placePaiIcon() {
  var iconSize = Math.round(36 * s)
  var dp = dotPos(5)

  // Map 40 buckets to our 4 unique colored files
  var images = []
  for (var i = 0; i < 3; i++) images.push('pai/red.png')    // 0-30 PAI
  for (var i = 0; i < 2; i++) images.push('pai/yellow.png') // 30-50 PAI
  for (var i = 0; i < 5; i++) images.push('pai/blue.png')   // 50-100 PAI
  for (var i = 0; i < 30; i++) images.push('pai/green.png') // 100-400 PAI

  // Using 'weather' helper from ui.js as it provides IMG_LEVEL widget
  weather({
    x: dp.x,
    y: dp.y,
    w: iconSize,
    h: iconSize,
    image_array: images,
    image_length: 40,
    type: hmUI.data_type.PAI_WEEKLY,
  })
}
