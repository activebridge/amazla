import { createWidget, widget, align, text_style, setAppWidgetSize, getAppWidgetSize, event } from '@zos/ui'
import { push } from '@zos/router'
import { localStorage } from './home/utils.js'

const { w, h, margin } = getAppWidgetSize()

AppWidget({
  state: {
    settings: localStorage.settings || { },
  },

  onInit() {
    console.log('Widget onInit called')
  },

  onResume() {
    console.log('Widget onResume called')
    this.build()
  },

  build() {
    setAppWidgetSize({ h: h/3 })
    const { settings: { actions, config: { secondary } } } = localStorage
    console.log('Widget build called')
    console.log('App widget size:', JSON.stringify(getAppWidgetSize()))
    const action = actions.find(a => a.id === secondary)
    console.log(JSON.stringify(action))
    const bg = createWidget(widget.IMG, {
      x: margin,
      y: 0,
      w: w,
      h: h,
      src: 'bg.png',
      auto_scale: true,
    })
    bg.addEventListener(event.CLICK_DOWN, () => {
      console.log('Widget clicked, navigating to home')
      push({ url: '/gt/home', params: action.id })
    })
    const text = createWidget(widget.TEXT, {
      x: 96,
      y: 0,
      w: 288,
      h: 46,
      color: 0xffffff,
      text_size: 36,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: action?.title || 'No Action Selected'
    })
    createWidget(widget.BUTTON, {
      x: 0,
      y: 0,
      w: w/2,
      h: 50,
      radius: 12,
      normal_scr: '',
      press_src: 'buttons/_btn.png',
      text: action.title,
      click_func: (button_widget) => {
        push({ url: 'page/gt/home/index.page', params: action.id })
      }
    })
  }
})
