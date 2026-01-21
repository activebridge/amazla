import { prop } from '@zos/ui'
import { push } from '@zos/router'
import { height, width, button } from './../../pages/ui.js'
import { keepScreenOn } from './../../zeppify/screen.js'
import { localStorage } from './../page/utils.js'
import { getTimeRemaining } from './../page/libs/totp.js'
import { Layout, refreshCodes } from 'zosLoader:./index.[pf].layout.js'
import vibrate from './../../pages/vibrate.js'

let timerInterval = null

SecondaryWidget({
  onInit() {
    this.accounts = localStorage.accounts || []
  },

  build() {
    keepScreenOn(true)
    const accounts = this.accounts.slice(0, 6)

    this.layout = Layout(accounts)

    // Click to open app
    button({
      w: width,
      h: height,
      src: 'black',
      click_func: () => push({ url: 'page/index.page' }),
    })

    this.startTimer()
  },

  startTimer() {
    timerInterval = setInterval(() => {
      const remaining = getTimeRemaining()

      if (this.layout?.updateTimer) {
        this.layout.updateTimer(remaining)
      }

      if (remaining === 30) {
        refreshCodes()
        vibrate()
      }
    }, 1000)
  },

  onResume() {
    refreshCodes()
  },

  onDestroy() {
    keepScreenOn(false)
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
  },
})
