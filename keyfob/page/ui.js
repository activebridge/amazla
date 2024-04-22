
import * as hmUI from '@zos/ui'
import { getDeviceInfo, SCREEN_SHAPE_SQUARE } from '@zos/device'

const { width, height, screenShape } = getDeviceInfo()
let widgets = []

export const page = (x = 0, y = 0) => {
  return hmUI.createWidget(hmUI.widget.GROUP, {
    x: width * x,
    y: height * y,
    w: width,
    h: height,
  })
}

const center = ({ x = 0, y = 0, w = width, h = height, radius = height }) => {
  return {
    x: Math.floor(((width - w) / 2) + x),
    y: Math.floor(((48 + height - h) / 2) + y),
    w,
    h,
    center_x: Math.floor((w / 2) + x),
    center_y: Math.floor(((h +28) / 2) + y),
  }
}

export const img = (props = {}, group = hmUI) => {
  return widgets.push(group.createWidget(hmUI.widget.IMG, {
    ...props,
    ...center(props),
  }))
}

export const text = (props = {}, group = hmUI) => {
  return widgets.push(group.createWidget(hmUI.widget.TEXT, {
    color: 0xffffff,
    align_h: hmUI.align.CENTER_H,
    align_v: hmUI.align.CENTER_V,
    text_style: hmUI.text_style.NONE,
    text_size: 20,
    ...props,
    ...center(props),
  }))
}

export const button = (props = {}, group = hmUI) => {
  const { src } = props
  return widgets.push(group.createWidget(hmUI.widget.BUTTON, {
    text: props.src || props.normal_src ? '' : '✓',
    normal_color: props.src || props.normal_src ? undefined : 0x333333,
    press_color: props.src || props.normal_src ? undefined : 0x000000,
    radius: 30,
    text_size: 30,
    normal_src: src ? `buttons/${src}.png` : undefined,
    press_src: src ? `buttons/_${src}.png` : undefined,
    ...props,
    ...center({ w: 50, h: 50, ...props, }),
  }))
}

export const circle = (props = {}, group = hmUI) => {
  return widgets.push(group.createWidget(hmUI.widget.CIRCLE, {
    color: 0x000000,
    radius: Math.floor(height / 2),
    alpha: 150,
    ...props,
    ...center({ radius: props.radius, ...props }),
  }))
}

export const progress = (props = {}, group = hmUI) => {
  return widgets.push(group.createWidget(hmUI.widget.ARC_PROGRESS, {
    ...props,
    ...center(props),
  }))
}

export const animation = (props = {}, group = hmUI) => {
  return widgets.push(group.createWidget(hmUI.widget.IMG_ANIM, {
    ...props,
    ...center(props),
  }))
}

export default {
  reset: () => {
    widgets.map(w => w.setProperty(hmUI.prop.VISIBLE, false) && hmUI.deleteWidget(w))
    widgets = []
    return widgets
  }
}
