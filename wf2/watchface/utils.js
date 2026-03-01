import { width, height, size } from '../../pages/ui.js'

export var s = size / 480

export function pos(offsetX, offsetY, w, h) {
  return {
    x: Math.floor((width - w) / 2 + offsetX),
    y: Math.floor((height - h) / 2 + offsetY),
  }
}

export function dotPos(clockHour) {
  var angle = (clockHour * 30 - 90) * Math.PI / 180
  var r = Math.floor(size / 2) - 4 - Math.floor(Math.round(36 * s) / 2)
  return {
    x: Math.round(r * Math.cos(angle)),
    y: Math.round(r * Math.sin(angle)),
  }
}
