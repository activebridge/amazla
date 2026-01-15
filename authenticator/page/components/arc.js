import * as hmUI from '@zos/ui'
import { width, height } from './../../../pages/ui.js'

const LINE_WIDTH = 10

let container = null
let gradientImg = null
let blackArc = null

export const createTimerArc = () => {
  const size = Math.min(width, height)

  // Create container with highest z_index
  container = hmUI.createWidget(hmUI.widget.VIEW_CONTAINER, {
    x: 0,
    y: 0,
    w: width,
    h: height,
    z_index: 2,
    scroll_enable: false,
  })

  // Gradient arc PNG (full circle, always visible)
  gradientImg = container.createWidget(hmUI.widget.IMG, {
    x: (width - size) / 2,
    y: (height - size) / 2,
    w: size,
    h: size,
    src: 'gradient_arc.png',
    auto_scale: true,
  })

  // Black arc on top to mask the "used" portion
  // Shifted 1px left/top and 2px bigger to cover gradient edges
  blackArc = container.createWidget(hmUI.widget.ARC, {
    x: (width - size) / 2 - 1,
    y: (height - size) / 2 - 1,
    w: size + 2,
    h: size + 2,
    line_width: LINE_WIDTH,
    start_angle: -90,
    end_angle: -90,
    color: 0x000000,
  })

  return { gradientImg, blackArc }
}

export const updateTimerArc = (remaining, total = 30) => {
  if (!blackArc) return

  // Black arc covers from where progress ends to complete the circle
  const progress = (remaining / total) * 360
  const startAngle = -90 + progress
  const endAngle = -90 + 360

  blackArc.setProperty(hmUI.prop.MORE, {
    start_angle: startAngle,
    end_angle: remaining === total ? startAngle : endAngle,
  })
}

export const destroyTimerArc = () => {
  if (container) hmUI.deleteWidget(container)
  container = null
  gradientImg = null
  blackArc = null
}
