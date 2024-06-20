import { readFileSync, writeFileSync } from './../utils/fs'

const { messageBuilder } = getApp()._options.globalData;
const vibrator = hmSensor.createSensor(hmSensor.id.VIBRATE)
const vibrate = () => {
  vibrator.stop()
  vibrator.scene = 23
  vibrator.start()
}
const COLORS = [0xFFBD44, 0xFF605C, 0x00CA4E]
let isRunning = false

Page({
  state: {},

  build() {
    hmUI.updateStatusBarTitle('HTTP')
    const actions = [{}, {}, {}]
    // const actions = readFileSync()
    let widgets = []

    const Actions = actions => {
      actions.map((a, i) => {
        widgets.push(hmUI.createWidget(hmUI.widget.TEXT, {
          x: 4,
          y: (i * 368) + 50,
          w: 190,
          h: 46,
          color: 0xffffff,
          text_size: 26,
          align_h: hmUI.align.CENTER_H,
          align_v: hmUI.align.CENTER_V,
          text_style: hmUI.text_style.NONE,
          text: a.title || 'N/A',
        }))

        widgets.push(hmUI.createWidget(hmUI.widget.BUTTON, {
          x: 14,
          y: (i * 368) + 150,
          w: 170,
          h: 170,
          text_size: 100,
          radius: 90,
          normal_color: COLORS[i] || 0x333333,
          press_color: 0x000000,
          text: a.icon || '▶',
          click_func: () => { this.fetchData(i) },
        }))

        const text = hmUI.createWidget(hmUI.widget.TEXT, {
          x: 96,
          y: 120,
          w: 288,
          h: 46,
          color: 0xffffff,
          text_size: 36,
          align_h: hmUI.align.CENTER_H,
          align_v: hmUI.align.CENTER_V,
          text_style: hmUI.text_style.NONE,
          text: '⚽♀ ♁ ♂ • ¼☃1☂☀★☆☉☎☏☜☞☟☯♠ ♡ ♢ ♣ ♤ ♥ ♦ ♧ ♨ ♩ ♪ ♫ ♬ ♭ ♮ ♯ ♲ ♳ ♴ ♵ ♶ ♷ ♸ ♹ ♺ ♻ ♼ ♽⚠⚾ ✂ ✓ ✚ ✽ ✿ ❀ ❖ ❶ ❷ ❸ ❹ ❺ ❻ ❼ ❽ ❾ ❿ ➀ ➁ ➂ ➃ ➄ ➅ ➆ ➇ ➈ ➉ ➊ ➋ ➌ ➍ ➎ ➏ ➐ ➑ ➒ ➓ ➡ © ® ™ @ ¶ § ℀ ℃  ℅ ℉ ℊ ℓ № ℡  Ω ℧ Å ℮ ℵ ℻  ☖ ☗'
        })
      })
    }
    Actions(actions)

    hmUI.setScrollView(true, px(368), actions.length, true)
    hmUI.scrollToPage(Math.floor(actions.length / 2) - 1, false)

    const getActions = () => {
      messageBuilder.request({ method: 'GET_ACTIONS' }).then(({ result }) => {

        if (JSON.stringify(actions) === JSON.stringify(result)) return
        widgets.map(p => { hmUI.deleteWidget(p) })
        widgets = []
        hmUI.setScrollView(true, px(368), result.length, true)
        hmUI.scrollToPage(Math.floor(result.length / 2) - 1, false)
        writeFileSync(result)
        Actions(result)
      }).catch((error) => {
        hmUI.showToast({ text: error })
      })
    }
    getActions()
  },

  fetchData(i) {
    if (isRunning) return hmUI.showToast({ text: 'Busy...' })

    isRunning = true
    hmUI.updateStatusBarTitle('Sending...')
    hmApp.setScreenKeep(true)

    messageBuilder.request({ method: i }).then(data => {
      isRunning = false
      vibrate()
      const { result = 'N/A', status = 'N/A' } = data
      hmUI.updateStatusBarTitle('HTTP: ' + status)
      hmUI.showToast({ text: result })
      hmApp.setScreenKeep(false)
      // hmApp.exit()
    }).catch(error => {
      hmUI.showToast({ text: error })
    })
  },
})
