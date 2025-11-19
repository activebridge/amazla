import * as hmUI from "@zos/ui";
import { TEXT_STYLE } from "zosLoader:./index.page.[pf].layout.js"
import UI, { text, img, height as h } from "./../../../../pages/ui.js"
import { Slide } from "./slide.js"
import { BasePage } from '@zeppos/zml/base-page'
import { AsyncStorage } from "@silver-zepp/easy-storage"
import { refreshSettings } from "./utils.js"
import { showToast } from '@zos/interaction'
import { notify } from '@zos/notification'
import { exit } from '@zos/router'
// import { scrollTo } from '@zos/page'
import { keepScreenOn } from './screen.js'
import { keyListener } from './keys.js'

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
  // scrollTo({ y: -h * Math.floor(currentFocus / buttons), animConfig: { anim_duration: 100 } })

  hmUI.scrollToPage(Math.floor(currentFocus / buttons), animate)

  widgets.map(w => w.setProperty(hmUI.prop.VISIBLE, false))
  widgets[currentFocus].setProperty(hmUI.prop.VISIBLE, true)
}

Page(
  BasePage({
    state: {
      settings: {
        actions: [],
        config: {
          output: 'toast',
          awake: false,
          exit: false,
          buttons: 1,
        },
      },
    },
    render() {
      const { actions, config: { buttons = 4, awake } } = this.state.settings
      let index = 0
      widgets = []
      currentFocus = -1

      UI.reset()
      for(let i = 0; i < actions.length; i += buttons) {

        const chunk = actions.slice(i, i + buttons)
        const slide = Slide(this, chunk, i, index)
        console.log('Slide created for actions:', JSON.stringify(slide))
        widgets = widgets.concat(slide)
        index += 1
      }
      hmUI.setScrollView(true, h, index, true)
      hmUI.setStatusBarVisible(false)
      // hmUI.scrollToPage(Math.floor(actions.length / 2) - 1, false)

      if (awake) keepScreenOn(true)
      keyListener(focus, this.execFocus)
    },

    fetch(id) {
      if (isBusy) return showToast({ content: 'Busy...' })
      isBusy = true
      const action = this.state.settings.actions.find(a => a.id === String(id))
      showToast({ content:  `Running ${action.title}` })
      this.request({ method: 'FETCH', params: { id } }).then(({ result }) => {
        isBusy = false
        console.log('fetch result:', JSON.stringify(result))
        showToast({ content: result.body })
        if (this.state.settings.config.exit && result.success) setTimeout(() => exit(), 2000)
        // notify({ title: 'HTTP', content: result.body, actions: [] })
      })
    },

    execFocus(isShortcut = false) {
      const { state: { settings: { actions, config: { press } } } } = app
      const action = !isShortcut ? actions[currentFocus] || actions[0] : actions.find(a => a.id === String(press))
      if (action) app.fetch(action.id)
    },

    build() {
      // text({ text: "   ", text_size: 40, font: "fonts/nerd-mono.ttf" });
      // text({ text: "⚽♀ ♁ ♂ • ¼☃1☂☀★☆☉☎☏☜☞☟☯♠ ♡ ♢ ♣ ♤ ♥ ♦ ♧ ♨ ♩ ♪ ♫ ♬ ♭ ♮ ♯ ♲ ♳ ♴ ♵ ♶ ♷ ♸ ♹ ♺ ♻ ♼ ♽⚠⚾ ✂ ✓ ✚ ✽ ✿ ❀ ❖ ❶ ❷ ❸ ❹ ❺ ❻ ❼ ❽ ❾ ❿ ➀ ➁ ➂ ➃ ➄ ➅ ➆ ➇ ➈ ➉ ➊ ➋ ➌ ➍ ➎ ➏ ➐ ➑ ➒ ➓ ➡ © ® ™ @ ¶ § ℀ ℃  ℅ ℉ ℊ ℓ № ℡  Ω ℧ Å ℮ ℵ ℻  ☖ ☗", text_size: 30 }, slide4)
      this.render()
      refreshSettings(this)
    },

    onInit() {
      app = this
      // const db = DB(this)
      // logger.log(JSON.stringify(this.state))
    },

    onDestroy() {
      // AsyncStorage.SaveAndQuit()
      if (awake) keepScreenOn(false)
      console.log('page onDestroy invoked')
    },
  }),
)
