import { createWidget, widget, align, text_style, setAppWidgetSize, getAppWidgetSize, event } from '@zos/ui'
import { button } from "./../../../pages/ui.js"
import { push } from '@zos/router'
import { localStorage } from './home/utils.js'

const { w, h, margin = 0 } = getAppWidgetSize()
const COLORS = [0xAA30BE, 0xFBDf89, 0x8CC9FC, 0x5723B5]

SecondaryWidget({
  state: {
    settings: localStorage.settings || { },
  },

  onInit() {
    console.log('Widget onInit called')
  },

  onResume() {
    console.log('Widget onResume called')
    // this.build()
  },

  build() {
    setAppWidgetSize({ h: 140 })
    const { settings: { actions, config: { secondary } } } = localStorage
    console.log('App widget size:', JSON.stringify(getAppWidgetSize()))
    const firstFourActions = actions.slice(0, 4)
    // const bg = createWidget(widget.IMG, {
    //   x: margin,
    //   y: 0,
    //   w: w,
    //   h: w/5 + 40,
    //   src: 'cardBg.png',
    //   auto_scale: true,
    // })
    firstFourActions.map((action, index) => {
      createWidget(widget.BUTTON, {
        x: margin + 5 + ((index) * w/firstFourActions.length),
        y: 20,
        w: (w - margin)/(firstFourActions.length) - 5,
        h: 100,
        radius: 40,
        text_size: 60,
        // normal_scr: 'buttons/_btnBg.png',
        // press_src: 'buttons/_btnBg.png',
        normal_color: COLORS[index],
        press_color: COLORS[index] - 0x002222,
        text: action.icon,
        click_func: () => {
          push({ url: 'page/gt/home/index.page', params: action.id })
        }
      })
    })
  },
})
