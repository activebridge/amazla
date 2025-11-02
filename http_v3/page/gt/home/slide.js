
import { rect, width as w, height as h, img, circle, text, button } from "./../../../../pages/ui.js";
import { event, prop } from '@zos/ui'
import { showToast } from '@zos/interaction'

let page = null

export const Slide = (p, actions = [], index = 0) => {
  console.log(JSON.stringify(actions))
  page = p
  img({ src: 'bg.png' })
  actions.map((action, i) => {
    QuarterButton(action, i, index)
  })
}

const onClick = (i) => {
  page.fetch(i)
}

const QuarterButton = (action, i, index) => {
  const props = [
    { x: -w/4 - 10, y: -w/4 -10 },
    { x: w/4 + 10, y: -w/4 -10 },
    { x: -w/4 - 10, y: w/4 +10 },
    { x: w/4 + 10, y: w/4 +10 },
  ]

  const textProps = [
    { x: -w/5, y: -w/5 },
    { x: w/5, y: -w/5 },
    { x: w/5, y: w/5 },
    { x: -w/5, y: w/5 },
  ]

  button({...props[i], text: '', src: 'btnBg', w: w/2, h: w/2, radius: 10, click_func: () => { onClick(i + index) } })
  // text({ text: "   ", text_size: 40, font: "fonts/nerd-mono.ttf" });

  text({ ...textProps[i], w: w/2, text: action.icon || '*⎘', text_size: 80 }).setEnable(false)
}
