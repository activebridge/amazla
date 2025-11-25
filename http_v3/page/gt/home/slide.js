import { prop } from '@zos/ui'
import {
  button,
  height as h,
  img,
  page,
  text,
  width as w,
} from './../../../../pages/ui.js'

let basePage = null

export const Slide = (p, actions = [], index = 0, i = 0) => {
  basePage = p
  const slide = page(0, i)
  return layout[actions.length - 1](actions, index, slide)
}

const onClick = (i) => {
  basePage.fetch(i)
}

const Single = (actions, _index, group) => {
  img({ src: 'singleBg.png', w, h: w }, group)

  const props = [{ w, h }]

  const iconProps = [{ w, h, text_size: 120, y: -30 }]

  const textProps = [{ w: w - 100, h, text_size: 40, y: 60, color: 0xc0c0c0 }]

  return renderActions(actions, props, textProps, iconProps, group)
}

const Double = (actions, _index, group) => {
  img({ src: 'doubleBg.png', w, h: w }, group)

  const props = [
    { y: -w / 4 - 14, w, h: w / 2 },
    { y: w / 4 + 14, w, h: w / 2 },
  ]

  const textProps = [
    { y: -50, w: w - 100, text_size: 40, color: 0xc0c0c0 },
    { y: 50, w: w - 100, text_size: 40, color: 0xc0c0c0 },
  ]

  const iconProps = [
    { y: -110, w: w / 2, text_size: 80 },
    { y: 110, w: w / 2, text_size: 80 },
  ]

  return renderActions(actions, props, textProps, iconProps, group)
}

const Triple = (actions, _index, group) => {
  img({ src: 'tripleBg.png', w, h: w }, group)

  const props = [
    { x: -w / 4, y: -w / 4, w: w / 2, h: w / 2 },
    { x: w / 4, y: -w / 4, w: w / 2, h: w / 2 },
    { y: w / 4 + 14, w, h: w / 2 },
  ]

  const iconProps = [
    { x: -w / 4 + 20, y: -w / 4, w: w / 4, text_size: 80 },
    { x: w / 4 - 20, y: -w / 4, w: w / 4, text_size: 80 },
    { y: 110, w: w / 2, text_size: 80 },
  ]

  const textProps = [
    { x: -w / 4 + 10, w: w / 4 + 50, y: -40, text_size: 20, color: 0xc0c0c0 },
    { x: w / 4 - 10, w: w / 4 + 50, y: -40, text_size: 20, color: 0xc0c0c0 },
    { y: 50, w: w - 100, text_size: 40, color: 0xc0c0c0 },
  ]

  return renderActions(actions, props, textProps, iconProps, group)
}

const Quad = (actions, _index) => {
  img({ src: 'quadBg.png', w, h: w }, group)

  const props = [
    { x: -w / 4, y: -w / 4, w: w / 2, h: w / 2 },
    { x: w / 4, y: -w / 4, w: w / 2, h: w / 2 },
    { x: w / 4, y: w / 4, w: w / 2, h: w / 2 },
    { x: -w / 4, y: w / 4, w: w / 2, h: w / 2 },
  ]

  const textProps = [
    { x: -w / 4 + 10, w: w / 4 + 50, y: -40, text_size: 20, color: 0xc0c0c0 },
    { x: w / 4 - 10, w: w / 4 + 50, y: -40, text_size: 20, color: 0xc0c0c0 },
    { x: w / 4 - 10, w: w / 4 + 50, y: 30, text_size: 20, color: 0xc0c0c0 },
    { x: -w / 4 + 10, w: w / 4 + 50, y: 30, text_size: 20, color: 0xc0c0c0 },
  ]

  const iconProps = [
    { x: -w / 4 + 20, y: -w / 4, w: w / 4, text_size: 80 },
    { x: w / 4 - 20, y: -w / 4, w: w / 4, text_size: 80 },
    { x: w / 4 - 20, y: w / 4 - 10, w: w / 4, text_size: 80 },
    { x: -w / 4 + 20, y: w / 4 - 10, w: w / 4, text_size: 80 },
  ]

  return renderActions(actions, props, textProps, iconProps, group)
}

const layout = [Single, Double, Triple, Quad]

const renderActions = (actions, props, textProps, iconProps, group) => {
  return actions.map((action, i) => {
    const icon = text(
      { ...iconProps[i], w: w / 2, text: action.icon || '✽' },
      group,
    )
    icon?.setEnable(false)
    const title = text({ ...textProps[i], text: action.title || '*' }, group)
    title?.setEnable(false)
    const hi = text(
      {
        ...iconProps[i],
        w: w / 2,
        text_size: iconProps[i].text_size - 6,
        text: action.icon || 'o',
        color: 0xd71920,
      },
      group,
    )
    hi?.setEnable(false)
    hi?.setProperty(prop.VISIBLE, false)
    btn = button(
      {
        ...props[i],
        text: '',
        src: 'btnBg',
        radius: 10,
        click_func: () => {
          onClick(action.id)
        },
      },
      group,
    )
    return hi
  })
}
