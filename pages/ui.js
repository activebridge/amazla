// Comment these if you want to use v1 UI
import * as hmUI from '@zos/ui'
import { redraw, deleteWidget } from '@zos/ui'
import { getDeviceInfo, SCREEN_SHAPE_SQUARE } from '@zos/device'
// end v1 UI

export const { width, height, screenShape } = getDeviceInfo()
export const size = Math.min(width, height)
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

export const group = (props = {}, group = hmUI) => {
  const stack = hmUI.createWidget(hmUI.widget.GROUP, {
    w: width,
    h: height,
    ...props,
    ...center(props),
  })
  widgets.push(stack)
  return stack
}

const center = ({ x = 0, y = 0, w = width, h = height, radius = height, bar = 0, centered = true }) => {
  if (!centered) {
    return { x, y, w, h, center_x: x + w / 2 | 0, center_y: y + h / 2 | 0 }
  }
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

export const arc = (props = {}, group = hmUI) => {
  const arcWidget = group.createWidget(hmUI.widget.ARC, {
    color: 0x1a73e8,
    line_width: 8,
    start_angle: 0,
    end_angle: 360,
    ...props,
    ...center(props),
  })
  widgets.push(arcWidget)
  return arcWidget
}

export const scrollBar = (props = {}, group = hmUI) => {
  const { target, ...rest } = props
  const scrollBarWidget = group.createWidget(hmUI.widget.PAGE_SCROLLBAR, {
    ...(target && { target }),
    ...rest,
  })
  widgets.push(scrollBarWidget)
  return scrollBarWidget
}

export const pageIndicator = (props = {}, group = hmUI) => {
  const pageIndicatorWidget = group.createWidget(hmUI.widget.PAGE_INDICATOR, {
    x: 0,
    y: height - 20,
    w: width,
    h: 20,
    align_h: hmUI.align.CENTER_H,
    h_space: 8,
    ...props,
  })
  widgets.push(pageIndicatorWidget)
  return pageIndicatorWidget
}

export const viewContainer = (props = {}) => {
  const { z_index = 0, scroll_enable = false, ...rest } = props
  const container = hmUI.createWidget(hmUI.widget.VIEW_CONTAINER, {
    x: 0,
    y: 0,
    w: width,
    h: height,
    z_index,
    scroll_enable,
    ...rest,
  })
  widgets.push(container)
  return container
}

export const editable = (props = {}) => {
  var types = props.optional_types || []
  var pos = center(props)
  var w = hmUI.createWidget(hmUI.widget.WATCHFACE_EDIT_GROUP, {
    edit_id: props.edit_id,
    x: pos.x,
    y: pos.y,
    w: pos.w,
    h: pos.h,
    select_image: props.select_image || 'edit/select.png',
    un_select_image: props.un_select_image || 'edit/unselect.png',
    default_type: types.length > 0 ? types[0].type : 0,
    optional_types: types,
    count: types.length,
    tips_BG: props.tips_BG || 'edit/unselect.png',
    tips_x: props.tips_x || 0,
    tips_y: props.tips_y || 0,
    tips_width: props.tips_width,
    tips_margin: props.tips_margin,
  })
  widgets.push(w)
  return w
}

export const level = (props = {}, group = hmUI) => {
  const levelWidget = group.createWidget(hmUI.widget.IMG_LEVEL, {
    ...props,
    ...center(props),
  })
  widgets.push(levelWidget)
  return levelWidget
}

export const weather = (props = {}, group = hmUI) => {
  const { folder = "weather", ...rest } = props
  return level({
    image_array: Array.from({ length: 29 }, (_, i) => `${folder}/${i}.png`),
    image_length: 29,
    type: hmUI.data_type.WEATHER,
    ...rest,
  }, group)
}

export const time = (props = {}, group = hmUI) => {
  const { folder = 'time', ...rest } = props
  const pos = center(props)
  const timeWidget = group.createWidget(hmUI.widget.IMG_TIME, {
    hour_zero: 1,
    hour_startX: pos.x,
    hour_startY: pos.y,
    hour_array: Array.from({ length: 10 }, (_, i) => `${folder}/${i}.png`),
    hour_space: 2,
    hour_align: hmUI.align.CENTER_H,
    hour_unit_en: `${folder}/colon.png`,
    hour_unit_sc: `${folder}/colon.png`,
    minute_follow: 1,
    minute_zero: 1,
    minute_array: Array.from({ length: 10 }, (_, i) => `${folder}/${i}.png`),
    minute_space: 2,
    ...rest,
  })
  widgets.push(timeWidget)
  return timeWidget
}

export const status = (props = {}, group = hmUI) => {
  const statusWidget = group.createWidget(hmUI.widget.IMG_STATUS, {
    ...props,
    ...center(props),
  })
  widgets.push(statusWidget)
  return statusWidget
}

export const alarm = (props = {}, group = hmUI) => {
  return status({ type: hmUI.system_status.CLOCK, src: 'status/alarm.png', ...props }, group)
}

export const disconnect = (props = {}, group = hmUI) => {
  return status({ type: hmUI.system_status.DISCONNECT, src: 'status/disconnect.png', ...props }, group)
}

export const dnd = (props = {}, group = hmUI) => {
  return status({ type: hmUI.system_status.DISTURB, src: 'status/dnd.png', ...props }, group)
}

export const lock = (props = {}, group = hmUI) => {
  return status({ type: hmUI.system_status.LOCK, src: 'status/lock.png', ...props }, group)
}

export const textImg = (props = {}, group = hmUI) => {
  const textImgWidget = group.createWidget(hmUI.widget.TEXT_IMG, {
    font_array: Array.from({ length: 10 }, (_, i) => `fonts/${i}.png`),
    align_h: hmUI.align.CENTER_H,
    h_space: 1,
    ...props,
    ...center(props),
  })
  widgets.push(textImgWidget)
  return textImgWidget
}

export const temperature = (props = {}, group = hmUI) => {
  const tempWidget = group.createWidget(hmUI.widget.TEXT_IMG, {
    type: hmUI.data_type.WEATHER_CURRENT,
    font_array: Array.from({ length: 10 }, (_, i) => `fonts/${i}.png`),
    negative_image: 'fonts/minus.png',
    unit_sc: 'fonts/degree.png',
    unit_en: 'fonts/degree.png',
    align_h: hmUI.align.CENTER_H,
    h_space: 1,
    ...props,
    ...center(props),
  })
  widgets.push(tempWidget)
  return tempWidget
}

export const battery = (props = {}, group = hmUI) => {
  const outline = group.createWidget(hmUI.widget.IMG, {
    src: 'battery/icon.png',
    ...props,
    ...center(props),
  })
  const fill = group.createWidget(hmUI.widget.IMG_LEVEL, {
    image_array: Array.from({ length: 7 }, (_, i) => `battery/${i}.png`),
    image_length: 7,
    type: hmUI.data_type.BATTERY,
    ...props,
    ...center(props),
  })
  widgets.push(outline, fill)
  return fill
}

export const charge = (props = {}, group = hmUI) => {
  const chargeWidget = group.createWidget(hmUI.widget.TEXT_IMG, {
    type: hmUI.data_type.BATTERY,
    font_array: Array.from({ length: 10 }, (_, i) => `battery/font/${i}.png`),
    align_h: hmUI.align.CENTER_H,
    h_space: 1,
    ...props,
    ...center(props),
  })
  widgets.push(chargeWidget)
  return chargeWidget
}

export const label = (props = {}, group = hmUI) => {
  const labelWidget = group.createWidget(hmUI.widget.TEXT_IMG, {
    font_array: Array.from({ length: 10 }, (_, i) => `label-font/${i}.png`),
    align_h: hmUI.align.CENTER_H,
    h_space: -4,
    ...props,
    ...center(props),
  })
  widgets.push(labelWidget)
  return labelWidget
}

export const click = (props = {}, group = hmUI) => {
  const { x, y, w, h } = center(props)
  const clickWidget = group.createWidget(hmUI.widget.IMG_CLICK, {
    ...props,
    x, y, w, h,
  })
  widgets.push(clickWidget)
  return clickWidget
}

export const date = (props = {}, group = hmUI) => {
  const { x, y, ...rest } = props
  const pos = center({ ...props })
  const dateWidget = group.createWidget(hmUI.widget.IMG_DATE, {
    month_startX: pos.x,
    month_startY: pos.y,
    month_zero: 1,
    month_space: 2,
    month_en_array: Array.from({ length: 10 }, (_, i) => `fonts/${i}.png`),
    month_unit_en: 'fonts/separator.png',
    day_follow: 1,
    day_zero: 1,
    day_space: 2,
    align_h: hmUI.align.CENTER_H,
    day_en_array: Array.from({ length: 10 }, (_, i) => `fonts/${i}.png`),
    ...rest,
  })
  widgets.push(dateWidget)
  return dateWidget
}

export const weekday = (props = {}, group = hmUI) => {
  const { w, h, x, y, folder = 'weekdays', ...rest } = props
  const pos = center({ h: 40, ...props })
  const weekWidget = group.createWidget(hmUI.widget.IMG_WEEK, {
    x: pos.x,
    y: pos.y,
    week_en: Array.from({ length: 7 }, (_, i) => `${folder}/${i}.png`),
    week_sc: Array.from({ length: 7 }, (_, i) => `${folder}/${i}.png`),
    week_tc: Array.from({ length: 7 }, (_, i) => `${folder}/${i}.png`),
    ...rest,
  })
  widgets.push(weekWidget)
  return weekWidget
}

export const polyline = (props = {}, group = hmUI) => {
  const { data = [], centered = true, ...rest } = props
  const pos = center({ centered, ...rest })
  const polylineWidget = group.createWidget(hmUI.widget.GRADKIENT_POLYLINE, {
    x: pos.x,
    y: pos.y,
    w: pos.w,
    h: pos.h,
  })
  if (data.length) {
    polylineWidget.clear()
    polylineWidget.addLine({ data, count: data.length })
    polylineWidget.addPoint({ data, count: data.length })
  }
  widgets.push(polylineWidget)
  return polylineWidget
}

export const scrollList = (props = {}, group = hmUI) => {
  const {
    x = 0,
    y = 0,
    w: listWidth = width,
    h: listHeight = height,
    itemHeight = 80,
    itemSpace = 8,
    itemBgColor = 0x1a1a1a,
    itemRadius = 16,
    data = [],
    textViews = [],
    imageViews = [],
    onClick = () => {},
    onFocusChange = null,
    ...rest
  } = props

  const itemConfig = [{
    type_id: 1,
    item_height: itemHeight,
    item_bg_color: itemBgColor,
    item_bg_radius: itemRadius,
    text_view: textViews,
    text_view_count: textViews.length,
    image_view: imageViews,
    image_view_count: imageViews.length,
  }]

  const listWidget = group.createWidget(hmUI.widget.SCROLL_LIST, {
    x,
    y,
    w: listWidth,
    h: listHeight,
    item_space: itemSpace,
    item_config: itemConfig,
    item_config_count: itemConfig.length,
    data_array: data.map(item => ({ ...item, type: 1 })),
    data_count: data.length,
    item_click_func: (list, index, key) => onClick(index, data[index], key),
    item_focus_change_func: onFocusChange,
    ...rest,
  })

  widgets.push(listWidget)
  return listWidget
}

export const delegate = (onResume, onPause) => {
  return hmUI.createWidget(hmUI.widget.WIDGET_DELEGATE, {
    resume_call: onResume,
    pause_call: onPause,
  })
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
