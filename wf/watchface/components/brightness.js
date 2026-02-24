import { button, circle, page, rect, height } from "../../../pages/ui.js";
import * as hmUI from '@zos/ui'
import { getBrightness, setBrightness } from '@zos/display'

let isVisible = false

export const brightness = ({ x, y }, group = hmUI) => {

  const brightnessHeight = height/200 * getBrightness()
  console.log(brightnessHeight)

  const toggle = () => {
    isVisible = !isVisible
    console.log('Brightness toggled:', isVisible)
    bg.setProperty(hmUI.prop.VISIBLE, isVisible)
    bar.setProperty(hmUI.prop.VISIBLE, isVisible)
    level.setProperty(hmUI.prop.VISIBLE, isVisible)
    hmUI.showToast({ text: isVisible })
  }
  button({ click_func: toggle, x, y })

  const update = () => {
    const brightness = getBrightness()
    console.log('Current brightness:', brightness)
    const h = height/200 * brightness
    const y = -50 + h/2
    level.setProperty(hmUI.prop.MORE, { h, color: 0xFF00FF })
  }

  const adjust = (info) => {
    setBrightness(getBrightness() + 10)
    update()
    console.log(JSON.stringify(info))
  }

  const brigtnessWidget = page()
  const bg = rect({ alpha: 200, color: 0x000000 }, brigtnessWidget)
  const bar = rect({ color: 0x333333, h: height/2, w: 80, radius: 40, y: -50 })
  const level = rect({ color: 0xFFFFFF, h: height/2 - 20, w: 60, radius: 30, y: -50 })

  bg.addEventListener(hmUI.event.CLICK_DOWN, toggle)
  bg.setProperty(hmUI.prop.VISIBLE, isVisible)
  bar.setProperty(hmUI.prop.VISIBLE, isVisible)
  bar.addEventListener(hmUI.event.CLICK_DOWN, adjust)
  level.setProperty(hmUI.prop.VISIBLE, isVisible)
  level.setEnabled && level.setEnabled(false)
}
