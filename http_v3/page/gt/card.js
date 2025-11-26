import { push } from '@zos/router'
import { align, createWidget, getAppWidgetSize, setAppWidgetSize, widget } from '@zos/ui'
import { localStorage } from './home/utils.js'

const { w, margin = 0 } = getAppWidgetSize()
const COLORS = [0xaa30be, 0xfbdf89, 0x8cc9fc, 0x5723b5]

AppWidget({
  state: { settings: localStorage.settings },

  onInit() {
    this.state.settings = localStorage.settings
  },

  build() {
    setAppWidgetSize({ h: 140 })
    const {
      settings: {
        actions,
        config: { buttons = 4 },
      },
    } = this.state
    const firstFourActions = actions.slice(0, buttons)

    if (actions.length === 0) {
      createWidget(widget.TEXT, {
        x: margin + 20,
        y: 20,
        w: w - margin - 20,
        h: 100,
        text_size: 30,
        color: 0xffffff,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text: 'No actions configured.',
      })
      return
    }

    firstFourActions.forEach((action, index) => {
      createWidget(widget.BUTTON, {
        x: margin + 5 + (index * w) / firstFourActions.length,
        y: 20,
        w: (w - margin) / firstFourActions.length - 5,
        h: 100,
        radius: 40,
        text_size: 60,
        normal_color: COLORS[index],
        press_color: COLORS[index] - 0x002222,
        text: action.icon || '✽',
        click_func: () => {
          push({ url: 'page/gt/home/index.page', params: action.id })
        },
      })
    })
  },
})
