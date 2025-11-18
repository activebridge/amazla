import * as hmUI from "@zos/ui";
import { onKey, KEY_UP, KEY_EVENT_DOUBLE_CLICK, KEY_EVENT_LONG_PRESS } from '@zos/interaction'
import { TEXT_STYLE } from "zosLoader:./index.page.[pf].layout.js"
import UI, { text, img, height as h } from "./../../../../pages/ui.js"
import { Slide } from "./slide.js"
import { BasePage } from '@zeppos/zml/base-page'
import { AsyncStorage } from "@silver-zepp/easy-storage"
import { refreshSettings } from "./utils.js"
import { showToast } from '@zos/interaction'
import { notify } from '@zos/notification'
import { keepScreenOn } from './screen.js'

Page(
  BasePage({
    state: {
      settings: {
        actions: [{ title: 'Loading...' }],
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

      UI.reset()
      for(let i = 0; i < actions.length; i += buttons) {

        const chunk = actions.slice(i, i + buttons)
        Slide(this, chunk, i, index)
        index += 1
        hmUI.setScrollView(true, h, index, true)
        hmUI.setStatusBarVisible(false)
        hmUI.scrollToPage(Math.floor(actions.length / 2) - 1, false)
      }

      onKey({
        callback: (key, keyEvent) => {
          console.log(keyEvent)
          return true
        },
      })

      if (awake) keepScreenOn(true)
    },

    fetch(id) {
      this.request({ method: 'FETCH', params: { id } }).then(({ result }) => {
        console.log('fetch result:', JSON.stringify(result))
        showToast({ content: result.body })
        // notify({ title: 'HTTP', content: result.body, actions: [] })
      })
    },

    build() {
      // text({ text: "   ", text_size: 40, font: "fonts/nerd-mono.ttf" });
      // text({ text: "⚽♀ ♁ ♂ • ¼☃1☂☀★☆☉☎☏☜☞☟☯♠ ♡ ♢ ♣ ♤ ♥ ♦ ♧ ♨ ♩ ♪ ♫ ♬ ♭ ♮ ♯ ♲ ♳ ♴ ♵ ♶ ♷ ♸ ♹ ♺ ♻ ♼ ♽⚠⚾ ✂ ✓ ✚ ✽ ✿ ❀ ❖ ❶ ❷ ❸ ❹ ❺ ❻ ❼ ❽ ❾ ❿ ➀ ➁ ➂ ➃ ➄ ➅ ➆ ➇ ➈ ➉ ➊ ➋ ➌ ➍ ➎ ➏ ➐ ➑ ➒ ➓ ➡ © ® ™ @ ¶ § ℀ ℃  ℅ ℉ ℊ ℓ № ℡  Ω ℧ Å ℮ ℵ ℻  ☖ ☗", text_size: 30 }, slide4)
      this.render()
      refreshSettings(this)
    },

    onInit() {
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
