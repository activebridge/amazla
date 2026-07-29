import { viewContainer, img, arc, rect, scrollBar, size, width, isRound, isV1 } from './../../../pages/ui.js'

// The countdown indicator, one component, picked at runtime:
//
//            round                          square
//   v2+   arc sweeping the bezel      gradient bar under a black cover
//   v1    nothing (the background     the system status-bar title, as a
//         gradient carries it)        6-cell ████░░ depleting bar
//
// The v2+ branches build a VIEW_CONTAINER and stack images with edge shadows —
// neither exists on API 1.0, so the v1 branches never construct them.
// All four return the same { update(remaining) }.

const PERIOD = 30
const CELLS = 6

const Arc = () => {
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

  const geometry = { w: size + 2, h: size + 2, line_width: 16, color: 0x000000 }
  const bgArc = arc({ ...geometry, start_angle: 0, end_angle: 360 }, container)

  return {
    update: (remaining) => {
      // Rotate while growing (full circle in 30 steps, starts at top)
      const rotation = -90 + (PERIOD - remaining) * 12 // Start at top (-90°), 12° per second
      const coverage = (1 - remaining / PERIOD) * 360 // Grows as time decreases
      // Repeat the geometry: `.set` re-runs the centering pipeline, so a
      // partial update would resize the arc to the screen box.
      bgArc.set({ ...geometry, start_angle: rotation, end_angle: rotation + coverage })
    },
  }
}

const Bar = () => {
  const container = viewContainer({ z_index: 2 })
  container.setEnable(false)

  const fade = img({ src: 'fade_mask.png' }, container)
  fade.setEnable(false)
  // Inset from the rounded screen corners
  const m = 40
  const bw = width - m * 2

  // Gradient bar
  const bg = img({ src: 'gradient_bar.png', x: m, y: 0, w: bw, h: 5, centered: false }, container)
  bg.setEnable(false)

  // Black cover bar (covers from right side)
  const cover = rect({ x: width - m, w: 0, h: 5, color: 0x000000, radius: 10, centered: false }, container)
  cover.setEnable(false)

  // Page scroll indicator
  scrollBar()

  return {
    update: (remaining) => {
      const progress = (remaining / PERIOD) * bw
      cover.set({ centered: false, x: (m + progress) | 0, y: 0, w: (bw - progress + 10) | 0, h: 5 })
    },
  }
}

// API 1.0 square: the OS draws a status bar we can't hide usefully, so the
// countdown goes in its title.
const StatusBar = () => ({
  update: (remaining) => {
    const seg = Math.round((remaining / PERIOD) * CELLS)
    hmUI.updateStatusBarTitle('█'.repeat(seg) + '░'.repeat(CELLS - seg))
  },
})

export const Timer = () => {
  if (isV1) return isRound ? { update: () => {} } : StatusBar()
  return isRound ? Arc() : Bar()
}
