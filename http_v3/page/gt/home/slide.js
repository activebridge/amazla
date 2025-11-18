
import { rect, width as w, height as h, img, circle, text, button, page } from "./../../../../pages/ui.js";
import { event, prop } from '@zos/ui'
import { showToast } from '@zos/interaction'

let basePage = null

export const Slide = (p, actions = [], index = 0, i = 0) => {
  basePage = p
  const slide = page(0, i)
  return layout[actions.length - 1](actions, index, slide)
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
    { w, h, text_size: 120, y: -20 },
  ]

  const textProps = [
    { w: w - 140, h, text_size: 40, y: 60, color: 0xC0C0C0 },
  ]

  return renderActions(actions, props, textProps, iconProps, group)
}

const Double = (actions, index, group) => {
  img({ src: 'doubleBg.png', w: w - 40, h: h - 40 }, group)

  const props = [
    { y: -w/4 - 14, w, h: w/2 },
    { y: w/4 + 14, w, h: w/2 },
  ]

  const textProps = [
    { y: -w/5 + 40, w: w - 140, text_size: 40, color: 0xC0C0C0 },
    { y: w/5 - 50, w: w - 140, text_size: 40, color: 0xC0C0C0 },
  ]

  const iconProps = [
    { y: -w/5 - 20, w: w/2, text_size: 80 },
    { y: w/5 + 20, w: w/2, text_size: 80 },
  ]

  return renderActions(actions, props, textProps, iconProps, group)
}

const Triple = (actions, index, group) => {
  img({ src: 'tripleBg.png', w: w - 40, h: h - 40 }, group)

  const props = [
    { x: -w/4 - 10, y: -w/4 -10, w: w/2, h: w/2 },
    { x: w/4 + 10, y: -w/4 -10, w: w/2, h: w/2 },
    { y: w/4 + 14, w, h: w/2 },
  ]

  const iconProps = [
    { x: -w/5, y: -w/5, text_size: 80 },
    { x: w/5, y: -w/5, text_size: 80 },
    { y: w/5 + 30, w: w/2, text_size: 80 },
  ]

  const textProps = [
    { x: -w/5, y: -w/5 + 50, w: w/2 - 80, text_size: 20, color: 0xC0C0C0 },
    { x: w/5, y: -w/5 + 50, w: w/2 - 80, text_size: 20, color: 0xC0C0C0 },
    { y: 60, w: w - 140, text_size: 40, color: 0xC0C0C0 },
  ]

  return renderActions(actions, props, textProps, iconProps, group)
}

const Quad = (actions, index) => {
  img({ src: 'quadBg.png', w: w - 40, h: h - 40 }, group)

  const props = [
    { x: -w/4 - 10, y: -w/4 -10, w: w/2, h: w/2 },
    { x: w/4 + 10, y: -w/4 -10, w: w/2, h: w/2 },
    { x: w/4 + 10, y: w/4 +10, w: w/2, h: w/2 },
    { x: -w/4 - 10, y: w/4 +10, w: w/2, h: w/2 },
  ]

  const textProps = [
    { x: -w/5, w: w/4, y: -40, text_size: 20, color: 0xC0C0C0 },
    { x: w/5, w: w/4, y: -40, text_size: 20, color: 0xC0C0C0 },
    { x: w/5, w: w/4, y: 40, text_size: 20, color: 0xC0C0C0 },
    { x: -w/5, w: w/4, y: 40, text_size: 20, color: 0xC0C0C0 },
  ]

  const iconProps = [
    { x: -w/5, y: -w/5, text_size: 80 },
    { x: w/5, y: -w/5, text_size: 80 },
    { x: w/5, y: w/5, text_size: 80 },
    { x: -w/5, y: w/5, text_size: 80 },
  ]

  return renderActions(actions, props, textProps, iconProps, group)
}

const layout = [
  Single,
  Double,
  Triple,
  Quad,
]

const renderActions = (actions, props, textProps, iconProps, group) => {
  return actions.map((action, i) => {
    const icon = text({ ...iconProps[i], w: w/2, text: action.icon || 'o' }, group)
    icon.setEnable(false)
    const title = text({ ...textProps[i], text: action.title || '*' }, group)
    title.setEnable(false)
    const hi = text({ ...iconProps[i], w: w/2, text_size: iconProps[i].text_size + 10, text: action.icon || 'o', color: 0xED2939 }, group)
    hi.setEnable(false)
    hi.setProperty(prop.VISIBLE, false)
    btn = button({...props[i], text: '', src: 'btnBg', radius: 10, click_func: () => { onClick(action.id) } }, group)
    return hi
  })
}
