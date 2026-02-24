import { button, circle, page, rect, height } from "../../../pages/ui.js";
import * as hmUI from '@zos/ui'
import { getBrightness, setBrightness } from '@zos/display'

let isVisible = false
let brightness = 100

export const flash = ({ x = 0, y = 0 }, group = hmUI) => {

  const toggle = () => {
    isVisible = !isVisible
    console.log('Brightness toggled:', isVisible)
    bg.setProperty(hmUI.prop.VISIBLE, isVisible)
    if (isVisible) {
      brightness = getBrightness()
      setBrightness(100)
    } else {
      setBrightness(brightness)
    }
  }
  button({ click_func: toggle, x, y })

  console.log('Flash component initialized at:', x, y)
  const update = () => {
    const brightness = getBrightness()
    console.log('Current brightness:', brightness)
    const h = height/200 * brightness
    const y = -50 + h/2
  }

  const bg = rect({ color: 0xFFFFFF })

  bg.addEventListener(hmUI.event.CLICK_DOWN, toggle)
  bg.setProperty(hmUI.prop.VISIBLE, isVisible)
}
