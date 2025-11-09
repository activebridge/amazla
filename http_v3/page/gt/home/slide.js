
import { rect, width as w, height as h, img, circle, text, button, page } from "./../../../../pages/ui.js";
import { event, prop } from '@zos/ui'
import { showToast } from '@zos/interaction'

let basePage = null

export const Slide = (p, actions = [], index = 0, i = 0) => {
  basePage = p
  console.log('actions.length', actions.length)
  const slide = page(0, i)
  const view = layout[actions.length - 1]
  console.log(view)
  view(actions, index, slide)
}

const onClick = (i) => {
  basePage.fetch(i)
}

const Single = (actions, index, group) => {
  img({ src: 'singleBg.png', w: w - 40, h: h - 40 }, group)

  const props = [
    { w, h },
  ]

  const textProps = [
    { w, h, text_size: 120 },
  ]

  actions.map((action, i) => {
    button({...props[i], text: '', src: 'btnBg', radius: 10, click_func: () => { onClick(i + index) } }, group)

    text({ ...textProps[i], w: w/2, text: action.icon || '*⎘' }, group).setEnable(false)
  })
}

const Double = (actions, index, group) => {
  img({ src: 'doubleBg.png' }, group)

  const props = [
    { y: -w/4 - 14, w, h: w/2 },
    { y: w/4 + 14, w, h: w/2 },
  ]

  const textProps = [
    { y: -w/5 - 14 },
    { y: w/5 + 14 },
  ]

  actions.map((action, i) => {
    button({...props[i], text: '', src: 'btnBg', radius: 10, click_func: () => { onClick(i + index) } }, group)

    text({ ...textProps[i], w: w/2, text: action.icon || '*⎘', text_size: 80 }, group).setEnable(false)
  })
}

const Triple = (actions, index, group) => {
  img({ src: 'tripleBg.png' }, group)

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
    button({...props[i], text: '', src: 'btnBg', radius: 10, click_func: () => { onClick(i + index) } }, group)

    text({ ...textProps[i], w: w/2, text: action.icon || '*⎘', text_size: 80 }, group).setEnable(false)
  })
}

const Quad = (actions, index) => {
  img({ src: 'quadBg.png' }, group)

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

  actions.map((action, i) => {
    button({...props[i], text: '', src: 'btnBg', w: w/2, h: w/2, radius: 10, click_func: () => { onClick(i + index) } }, group)
    // text({ text: "   ", text_size: 40, font: "fonts/nerd-mono.ttf" });

    text({ ...textProps[i], w: w/2, text: action.icon || '*⎘', text_size: 80 }, group).setEnable(false)
  })
}

const layout = [
  Single,
  Double,
  Triple,
  Quad,
]
