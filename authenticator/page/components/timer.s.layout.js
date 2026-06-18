import { prop } from '@zos/ui'
import { viewContainer, img, rect, width as w, scrollBar } from './../../../pages/ui.js'

export const Timer = () => {
  const container = viewContainer({ z_index: 2 })
  container.setEnable(false)

  const fade = img({ src: 'fade_mask.png' }, container)
  fade.setEnable(false)
  // Inset from the rounded screen corners
  const m = 40
  const bw = w - m * 2

  // Gradient bar
  const bg = img({ src: 'gradient_bar.png', x: m, y: 0, w: bw, h: 5, centered: false }, container)
  bg.setEnable(false)

  // Black cover bar (covers from right side)
  const cover = rect({ x: w - m, w: 0, h: 5, color: 0x000000, radius: 10, centered: false }, container)
  cover.setEnable(false)

  // Page scroll indicator
  scrollBar()

  return {
    update: (remaining) => {
      const progress = (remaining / 30) * bw
      cover.setProperty(prop.X, (m + progress) | 0)
      cover.setProperty(prop.W, (bw - progress + 10) | 0)
    }
  }
}
