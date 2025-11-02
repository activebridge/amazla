import * as hmUI from "@zos/ui";
import { TEXT_STYLE } from "zosLoader:./index.page.[pf].layout.js"
import UI, { text, img } from "./../../../../pages/ui.js"
import { Slide } from "./slide.js"
import { BasePage } from '@zeppos/zml/base-page'
import { AsyncStorage } from "@silver-zepp/easy-storage"
import { refreshSettings } from "./utils.js"
import { showToast } from '@zos/interaction'

Page(
  BasePage({
    state: {
      settings: {
        actions: [{}],
        config: {
          output: 'toast',
          awake: false,
          exit: false,
          buttons: 1,
        },
      },
    },
    render() {
      const { actions, config: { buttons } } = this.state.settings
      UI.reset()
      for(let i=0; i<actions.length; i += buttons) {
        const chunk = actions.slice(i, i + buttons)
        Slide(this, chunk, i)
      }
    },

    fetch(index) {
      console.log('fetch invoked')
      this.request({ method: 'FETCH', params: { index } }).then(({ result }) => {
        console.log('fetch result:', JSON.stringify(result))
        showToast({ content: result.body })
      })
    },

    build() {
      // text({ text: "   ", text_size: 40, font: "fonts/nerd-mono.ttf" });
      this.render()
      refreshSettings(this)
    },

    onInit() {
      // const db = DB(this)
      // logger.log(JSON.stringify(this.state))
    },

    onDestroy() {
      // AsyncStorage.SaveAndQuit()
      console.log('page onDestroy invoked')
    },
  }),
)
