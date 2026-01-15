import * as hmUI from '@zos/ui'
import { width, height } from './../../../pages/ui.js'

let container = null

export const createFadeOverlay = () => {
  container = hmUI.createWidget(hmUI.widget.VIEW_CONTAINER, {
    x: 0,
    y: 0,
    w: width,
    h: height,
    z_index: 1,
    scroll_enable: false,
  })

  // Single fade mask covering full screen
  container.createWidget(hmUI.widget.IMG, {
    x: 0,
    y: 0,
    w: width,
    h: height,
    src: 'fade_mask.png',
    auto_scale: true,
  })
}

export const destroyFadeOverlay = () => {
  if (container) hmUI.deleteWidget(container)
  container = null
}
