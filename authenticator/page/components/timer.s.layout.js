import { prop } from '@zos/ui'
import { viewContainer, img, rect, width as w, scrollBar } from './../../../pages/ui.js'

export const Timer = () => {
  const container = viewContainer({ z_index: 2 })
  container.setEnable(false)

  const fade = img({ src: 'fade_mask.png' }, container)
  // Gradient bar
  const bg = img({ src: 'gradient_bar.png', x: 0, y: 0, w, h: 5, centered: false }, container)
  bg.setEnable(false)

  // Black cover bar (covers from right side)
  const cover = rect({ x: w, w: 0, h: 20, color: 0x000000, radius: 10, centered: false }, container)

  // Page scroll indicator
  scrollBar()

  return {
    update: (remaining) => {
      const progress = (remaining / 30) * w
      cover.setProperty(prop.X, progress | 0)
      cover.setProperty(prop.W, (w - progress + 10) | 0)
    }
  }
}
