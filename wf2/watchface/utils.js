import { width, height, size } from '../../pages/ui.js'

export function pos(offsetX, offsetY, w, h) {
  return {
    x: Math.floor((width - w) / 2 + offsetX),
    y: Math.floor((height - h) / 2 + offsetY),
  }
}
