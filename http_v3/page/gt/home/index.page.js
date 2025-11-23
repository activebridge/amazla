import * as hmUI from "@zos/ui";
import { TEXT_STYLE } from "zosLoader:./index.page.[pf].layout.js"
import UI, { text, img, height as h } from "./../../../../pages/ui.js"
import { Slide } from "./slide.js"
import { BasePage } from '@zeppos/zml/base-page'
import { localStorage } from "./utils.js"
import { showToast } from '@zos/interaction'
import { keepScreenOn } from './screen.js'
import { keyListener } from './keys.js'
import { response } from './response.js'

let isBusy = false
let widgets = []
let currentFocus = -1
let app = null

const focus = (i) => {
  const prevFocus = currentFocus
  currentFocus += i
  if (currentFocus >= widgets.length) currentFocus = 0
  if (currentFocus < 0) currentFocus = widgets.length - 1
  const { state: { settings: { actions, config: { buttons = 4 } } } } = app

  const animate = !(Math.abs(currentFocus - prevFocus) > 1)

  hmUI.scrollToPage(Math.floor(currentFocus / buttons), animate)

  widgets.map(w => w.setProperty(hmUI.prop.VISIBLE, false))
  widgets[currentFocus].setProperty(hmUI.prop.VISIBLE, true)
}

Page(
  BasePage({
    state: {
      settings: localStorage.settings || { actions: [], config: {} },
    },

    render() {
      console.log('Rendering home page...')
      const { actions = [], config: { buttons = 4, awake } = {} } = this.state.settings
      console.log(`State settings: ${JSON.stringify(this.state.settings)}`)
      let index = 0
      widgets = []
      currentFocus = -1
      console.log('Rendering home with settings:', JSON.stringify(settings))

      UI.reset()
      for(let i = 0; i < actions.length; i += buttons) {

        const chunk = actions.slice(i, i + buttons)
        const slide = Slide(this, chunk, i, index)
        widgets = widgets.concat(slide)
        index += 1
      }
      hmUI.setScrollView(true, h, index, true)
      hmUI.setStatusBarVisible(false)
      // hmUI.scrollToPage(Math.floor(actions.length / 2) - 1, false)

      if (awake) keepScreenOn(true)
      keyListener(focus, this.execFocus)
      console.log('RENDER COMPLETE')
    },

    fetch(id) {
      if (isBusy) return showToast({ content: 'Busy...' })
      isBusy = true
      const action = this.state.settings.actions.find(a => a.id === String(id))
      showToast({ content:  `Running ${action.title}` })
      this.request({ method: 'FETCH', params: { id } }).then(({ result }) => {
        response(result, this.state.settings)
      }).catch(error => { showToast({ content: `ERROR: ${error}` })
      }).finally(() => { isBusy = false })
    },

    execFocus(isShortcut = false) {
      const { state: { settings: { actions, config: { press } } } } = app
      const action = !isShortcut ? actions[currentFocus] || actions[0] : actions.find(a => a.id === String(press))
      if (action) {
        app.fetch(action.id)
      } else {
        showToast({ content: 'No action assigned' })
      }
    },

    build() {
      this.render()
      this.sync()
    },

    sync() {
      this.request({ method: 'SETTINGS' }).then(({ result }) => {
        if (!result) return
        if (JSON.stringify(this.state.settings) === JSON.stringify(result)) return

        this.state.settings = result
        // setTimeout(() => { this.render() }, 0)
        this.render()
        localStorage.settings = result
        showToast({ content: 'Update' })
      }).catch(error => showToast({ content: `ERROR: ${error}` }))
    },

    onInit(id) {
      app = this
      if (id) this.fetch(id)
      // this.state.settings = localStorage.settings
    },

    onDestroy() {
      if (awake) keepScreenOn(false)
      console.log('page onDestroy invoked')
    },
  }),
)
