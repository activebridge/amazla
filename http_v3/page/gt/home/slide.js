
import { rect, width as w, height as h, img, circle, text, button } from "./../../../../pages/ui.js";
import { event, prop } from '@zos/ui'
import { showToast } from '@zos/interaction'

let page = null

export const Slide = (p, actions = [], index = 0) => {
  page = p
  // actions.map((action, i) => {
  //   QuarterButton(action, i, index)
  // })
  layout[actions.length - 1](actions, index)
}

const onClick = (i) => {
  page.fetch(i)
}

const Single = (actions, index) => {
  img({ src: 'singleBg.png' })

  const props = [
    { w, h },
  ]

  const textProps = [
    { w, h, text_size: 120 },
  ]

  actions.map((action, i) => {
    button({...props[i], text: '', src: 'btnBg', radius: 10, click_func: () => { onClick(i + index) } })

    text({ ...textProps[i], w: w/2, text: action.icon || '*⎘' }).setEnable(false)
  })
}

const Double = (actions, index) => {
  img({ src: 'doubleBg.png' })

  const props = [
    { y: -w/4 - 14, w, h: w/2 },
    { y: w/4 + 14, w, h: w/2 },
  ]

  const textProps = [
    { y: -w/5 - 14 },
    { y: w/5 + 14 },
  ]

  actions.map((action, i) => {
    button({...props[i], text: '', src: 'btnBg', radius: 10, click_func: () => { onClick(i + index) } })

    text({ ...textProps[i], w: w/2, text: action.icon || '*⎘', text_size: 80 }).setEnable(false)
  })
}

const Triple = (actions, index) => {
  img({ src: 'tripleBg.png' })

  const props = [
    { x: -w/4 - 10, y: -w/4 -10, w: w/2, h: w/2 },
    { x: w/4 + 10, y: -w/4 -10, w: w/2, h: w/2 },
    { y: w/4 + 14, w, h: w/2 },
  ]

  const textProps = [
    { x: -w/5, y: -w/5 },
    { x: w/5, y: -w/5 },
    { y: w/5 },
  ]

  actions.map((action, i) => {
    button({...props[i], text: '', src: 'btnBg', radius: 10, click_func: () => { onClick(i + index) } })

    text({ ...textProps[i], w: w/2, text: action.icon || '*⎘', text_size: 80 }).setEnable(false)
  })
}

const Quad = (actions, index) => {
  img({ src: 'quadBg.png' })
  actions.map((action, i) => {
    QuarterButton(action, i, index)
  })
}

const layout = [
  Single,
  Double,
  Triple,
  Quad,
]

const QuarterButton = (action, i, index) => {
  const props = [
    { x: -w/4 - 10, y: -w/4 -10 },
    { x: w/4 + 10, y: -w/4 -10 },
    { x: w/4 + 10, y: w/4 +10 },
    { x: -w/4 - 10, y: w/4 +10 },
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
