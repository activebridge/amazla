import { prop } from '@zos/ui'
import { viewContainer, img, arc, size } from './../../../pages/ui.js'

export const Timer = () => {
  const container = viewContainer({ z_index: 2 })
  container.setEnable(false)

  const fade = img({ src: 'fade_mask.png' }, container)
  fade.setEnable(false)

  const center = size / 2
  const gradientArc = img({
    src: 'gradient_arc.png',
    center_x: center,
    center_y: center,
    angle: 0,
  }, container)
  gradientArc.setEnable(false)

  const bgArc = arc({
    w: size + 2,
    h: size + 2,
    line_width: 20,
    color: 0x000000,
    start_angle: 0,
    end_angle: 360,
  }, container)

  let angle = 270

  return {
    update: (remaining) => {
      bgArc.setProperty(prop.MORE, {
        start_angle: -90 + (remaining / 30) * 360,
        end_angle: 270,
      })
      angle = (angle + 12) % 360
      gradientArc.setProperty(prop.MORE, { angle })
    }
  }
}
