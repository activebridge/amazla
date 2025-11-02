// Comment these if you want to use v1 UI
import * as hmUI from '@zos/ui'
import { redraw, deleteWidget } from '@zos/ui'
import { getDeviceInfo, SCREEN_SHAPE_SQUARE } from '@zos/device'
// end v1 UI

export const { width, height, screenShape } = getDeviceInfo()
// const { width, height, screenShape } = hmSetting?.getDeviceInfo()// || getDeviceInfo()

let widgets = []

export const page = (x = 0, y = 0) => {
  const page = hmUI.createWidget(hmUI.widget.GROUP, {
    x: width * x,
    y: height * y,
    w: width,
    h: height,
  })
  widgets.push(page)
  return page
}

const center = ({ x = 0, y = 0, w = width, h = height, radius = height, bar = 0 }) => {
  return {
    x: Math.floor(((width - w) / 2) + x),
    y: Math.floor(((bar + height - h) / 2) + y),
    w,
    h,
    center_x: Math.floor((w / 2) + x),
    center_y: Math.floor(((h + bar + 1) / 2) + y),
  }
}

export const img = (props = {}, group = hmUI) => {
  const img = group.createWidget(hmUI.widget.IMG, {
    auto_scale: true,
    ...props,
    ...center(props),
  })
  widgets.push(img)
  return img
}

export const text = (props = {}, group = hmUI) => {
  const text = group.createWidget(hmUI.widget.TEXT, {
    color: 0xffffff,
    align_h: hmUI.align.CENTER_H,
    align_v: hmUI.align.CENTER_V,
    text_style: hmUI.text_style.NONE,
    text_size: 20,
    ...props,
    ...center(props),
  })
  widgets.push(text)
  return text
}

export const button = (props = {}, group = hmUI) => {
  const { src } = props
  const button = group.createWidget(hmUI.widget.BUTTON, {
    text: props.src || props.normal_src ? '' : '✓',
    normal_color: props.src || props.normal_src ? undefined : 0x333333,
    press_color: props.src || props.normal_src ? undefined : 0x000000,
    radius: 30,
    text_size: 30,
    normal_src: src ? `buttons/${src}.png` : undefined,
    press_src: src ? `buttons/_${src}.png` : undefined,
    ...props,
    ...center({ w: 50, h: 50, ...props, }),
  })
  widgets.push(button)
  return button
}

export const circle = (props = {}, group = hmUI) => {
  const circle = group.createWidget(hmUI.widget.CIRCLE, {
    color: 0x000000,
    radius: Math.floor(height / 2),
    alpha: 150,
    ...props,
    ...center({ radius: props.radius, ...props }),
  })
  circle.setEnable(false)
  widgets.push(circle)
  return circle
}

export const rect = (props = {}, group = hmUI) => {
  const rect = group.createWidget(hmUI.widget.FILL_RECT, {
    color: 0xFFFFFF,
    ...props,
    ...center(props),
  })
  widgets.push(rect)
  return rect
}

export const stroke = (props = {}, group = hmUI) => {
  const rect = group.createWidget(hmUI.widget.STROKE_RECT, {
    color: 0xFFFFFF,
    line_width: 10,
    angle: 0,
    ...props,
    ...center(props),
  })
  widgets.push(rect)
  return rect
}

export const progress = (props = {}, group = hmUI) => {
  const progress = group.createWidget(hmUI.widget.ARC_PROGRESS, {
    ...props,
    ...center(props),
  })
  widgets.push(progress)
  return progress
}

export const animation = (props = {}, group = hmUI) => {
  const animation = group.createWidget(hmUI.widget.IMG_ANIM, {
    ...props,
    ...center(props),
  })
  widgets.push(animation)
  return animation
}

export default {
  get widgets() { return widgets },
  reset: () => {
    // widgets.map(w => w.setProperty(prop.VISIBLE, false))
    widgets.map(w => hmUI.deleteWidget(w))
    // redraw()
    widgets = []
    return widgets
  }
}
