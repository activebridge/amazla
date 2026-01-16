import { prop } from '@zos/ui'
import { viewContainer, img, arc, size } from './../../../pages/ui.js'

let spinInterval = null

export const Timer = () => {
  const container = viewContainer({ z_index: 2 })
  container.setEnable(false)

  const fade = img({ src: 'fade_mask.png' }, container)
  fade.setEnable(false)

  // Gradient arc with rotation
  const center = size / 2
  const gradientArc = img({
    src: 'gradient_arc.png',
    center_x: center,
    center_y: center,
    angle: 0,
  }, container)
  gradientArc.setEnable(false)

  // Spinner animation
  let angle = 0
  spinInterval = setInterval(() => {
    angle = (angle + 2) % 360
    gradientArc.setProperty(prop.MORE, { angle })
  }, 50)

  const w = size + 2, h = w, line_width = 20, color = 0x000000
  return arc({ w, h, line_width, color }, container)
}

export const stopSpinner = () => {
  if (spinInterval) {
    clearInterval(spinInterval)
    spinInterval = null
  }
}

