import { button, getAppWidgetSize, setAppWidgetSize, text, width } from './../../pages/ui.js'
import { APP_ID, localStorage } from './../pages/utils.js'

const COLORS = [0xaa30be, 0xfbdf89, 0x8cc9fc, 0x5723b5]

// Tapping a pill launches the app on the action instead of running it here: an
// app-widget has no BLE transport of its own, and the page's onInit(param) already
// knows how to fire the action it was opened with.
const openAction = (id) => {
  if (typeof hmApp === 'undefined') return
  if (hmApp.startApp) {
    hmApp.startApp({ appid: APP_ID, url: 'pages/index', param: String(id), native: false })
  } else if (hmApp.gotoPage) {
    hmApp.gotoPage({ url: 'pages/index', param: String(id) })
  }
}

AppWidget({
  state: { settings: localStorage.settings },

  onInit() {
    this.state.settings = localStorage.settings
  },

  // App-widgets cannot createWidget outside build() — everything is drawn here.
  build() {
    const sz = getAppWidgetSize() || {}
    const w = sz.w || width
    const margin = sz.margin != null ? sz.margin : 0

    const {
      settings: { actions = [], config: { buttons = 4 } = {} },
    } = this.state

    const scale = w / 480
    const h = (140 * scale) | 0
    setAppWidgetSize({ h })

    if (actions.length === 0) {
      text({
        x: margin + (20 * scale | 0),
        y: (20 * scale) | 0,
        w: w - margin - (20 * scale | 0),
        h: h - ((40 * scale) | 0),
        text_size: (30 * scale) | 0,
        color: 0xffffff,
        centered: false,
        text: 'No actions configured.',
      })
      return
    }

    const pills = actions.slice(0, buttons)
    const gap = (5 * scale) | 0
    const pillW = ((w - margin) / pills.length - gap) | 0
    const pillH = h - ((40 * scale) | 0)

    pills.forEach((action, index) => {
      button({
        centered: false,
        x: margin + gap + ((index * w) / pills.length | 0),
        y: (20 * scale) | 0,
        w: pillW,
        h: pillH,
        radius: (40 * scale) | 0,
        text_size: (60 * scale) | 0,
        normal_color: COLORS[index % COLORS.length],
        press_color: COLORS[index % COLORS.length] - 0x002222,
        text: action.icon || '✽',
        click_func: () => {
          openAction(action.id)
        },
      })
    })
  },
})
