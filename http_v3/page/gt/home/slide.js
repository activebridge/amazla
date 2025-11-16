
import { rect, width as w, height as h, img, circle, text, button, page } from "./../../../../pages/ui.js";
import { event, prop } from '@zos/ui'
import { showToast } from '@zos/interaction'

let basePage = null

export const Slide = (p, actions = [], index = 0, i = 0) => {
  basePage = p
  const slide = page(0, i)
  layout[actions.length - 1](actions, index, slide)
}

const onClick = (i) => {
  basePage.fetch(i)
}

const Single = (actions, index, group) => {
  img({ src: 'singleBg.png', w: w - 40, h: h - 40 }, group)

  const props = [
    { w, h },
  ]

  const iconProps = [
    { w, h, text_size: 120 },
  ]

  const textProps = [
    { w: w - 140, h, text_size: 40 },
  ]

  actions.map((action, i) => {
    text({ ...iconProps[i], w: w/2, text: action.icon }, group).setEnable(false)
    text({ ...textProps[i], text: action.title || '*' }, group).setEnable(false)
    button({...props[i], text: '', src: 'btnBg', radius: 10, click_func: () => { onClick(i + index) } }, group)
  })
}

const Double = (actions, index, group) => {
  img({ src: 'doubleBg.png', w: w - 40, h: h - 40 }, group)

  const props = [
    { y: -w/4 - 14, w, h: w/2 },
    { y: w/4 + 14, w, h: w/2 },
  ]

  const textProps = [
    { y: -w/5 + 34 },
    { y: w/5 - 34 },
  ]

  const iconProps = [
    { y: -w/5 - 14 },
    { y: w/5 + 14 },
  ]

  actions.map((action, i) => {
    text({ ...iconProps[i], w: w/2, text: action.icon || '*', text_size: 80, font: 'fonts/nerd.ttf' }, group).setEnable(false)
    text({ ...textProps[i], w: w - 140, text: action.title || '*', text_size: 40 }, group).setEnable(false)
    button({...props[i], text: '', src: 'btnBg', radius: 10, click_func: () => { onClick(i + index) } }, group)
  })
}

const Triple = (actions, index, group) => {
  img({ src: 'tripleBg.png', w: w - 40, h: h - 40 }, group)

  const props = [
    { x: -w/4 - 10, y: -w/4 -10, w: w/2, h: w/2 },
    { x: w/4 + 10, y: -w/4 -10, w: w/2, h: w/2 },
    { y: w/4 + 14, w, h: w/2 },
  ]

  const iconProps = [
    { x: -w/5, y: -w/5 },
    { x: w/5, y: -w/5 },
    { y: w/5 },
  ]

  const textProps = [
    { x: -w/5, y: -w/5 + 50, w: w/2 - 80, text_size: 30 },
    { x: w/5, y: -w/5 + 50, w: w/2 - 80, text_size: 30 },
    { y: w/5 + 50, w: w - 140, text_size: 40 },
  ]

  actions.map((action, i) => {
    text({ ...iconProps[i], w: w/2, text: action.icon || '*', text_size: 80 }, group)
    text({ ...textProps[i], text: action.title || '*', text_size: 40 }, group).setEnable(false)
    button({...props[i], text: '', src: 'btnBg', radius: 10, click_func: () => { onClick(i + index) } }, group)
  })
}

const Quad = (actions, index) => {
  img({ src: 'quadBg.png', w: w - 40, h: h - 40 }, group)

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
    // text({ text: "   ", text_size: 40, font: "fonts/nerd-mono.ttf" });
    text({ ...textProps[i], w: w/2, text: action.icon || '*', text_size: 80, font: "fonts/nerd-mono.ttf" }, group)
    button({...props[i], text: '', src: 'btnBg', w: w/2, h: w/2, radius: 10, click_func: () => { onClick(i + index) } }, group)
  })
}

const layout = [
  Single,
  Double,
  Triple,
  Quad,
]
