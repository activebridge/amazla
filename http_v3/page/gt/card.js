import { createWidget, widget, setAppWidgetSize, getAppWidgetSize } from '@zos/ui'
import { localStorage } from './home/utils.js'

const { w, h, margin = 0 } = getAppWidgetSize()
const COLORS = [0xAA30BE, 0xFBDf89, 0x8CC9FC, 0x5723B5]

AppWidget({
  state: { settings: localStorage.settings || {} },

  build() {
    setAppWidgetSize({ h: 140 })
    const { settings: { actions, config: { buttons = 4 } } } = this.state
    const firstFourActions = actions.slice(0, buttons)

    firstFourActions.map((action, index) => {
      createWidget(widget.BUTTON, {
        x: margin + 5 + ((index) * w/firstFourActions.length),
        y: 20,
        w: (w - margin)/(firstFourActions.length) - 5,
        h: 100,
        radius: 40,
        text_size: 60,
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
