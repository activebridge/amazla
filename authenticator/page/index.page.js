import { setStatusBarVisible } from '@zos/ui'
import * as hmUI from '@zos/ui'
import { showToast } from '@zos/interaction'
import { keepScreenOn } from './../../zeppify/screen.js'
import UI, { screenShape, height } from './../../pages/ui.js'
import { localStorage } from './utils.js'
import { setScrollMode, SCROLL_MODE_SWIPER } from '@zos/page'
import { Timer } from 'zosLoader:./components/timer.[pf].layout.js'
import { Timer as TimerBg } from './components/timer-bg.js'
import { List, updateCodes, STEP } from './components/list.js'
import { getTimeRemaining } from './libs/totp.js'
import { createTimer } from './../shared/timer.js'

let app = null
let timer = null
let timerArc = null
let bg = null

// Read lazily — globalData.messageBuilder is set in app.onCreate, and a
// module-eval snapshot would capture the initial null.
const getMessageBuilder = () => getApp()._options.globalData.messageBuilder

Page({
    state: {
      accounts: localStorage.accounts,
    },

    build() {
      app = this
      setStatusBarVisible(false)
      keepScreenOn(true)

      this.render()
      this.startTimer()
      setTimeout(() => this.sync(), 1000)
    },

    render() {
      const { accounts } = this.state

      // v1-style gradient background, behind the cards (covers full scroll
      // height). Created before the list so it draws underneath.
      if (accounts.length > 0) {
        bg = TimerBg(accounts.length * STEP + height)
        bg.update(getTimeRemaining())
      }

      // Create scrollable account list
      List(accounts)

      if (accounts.length === 0) return

      // Enable scrolling: old API for round (crown works), new API for square
      if (screenShape === 0) {
        hmUI.setScrollView(true, height / 3 | 0, accounts.length, true)
        hmUI.scrollToPage(1, false)
      } else {
        setScrollMode({ mode: SCROLL_MODE_SWIPER, options: { height: STEP, count: accounts.length + 1 } })
        hmUI.scrollToPage(1, false)
      }

      // Create timer arc
      timerArc = Timer()
    },

    sync() {
      const messageBuilder = getMessageBuilder()
      if (!messageBuilder) return
      messageBuilder.request({ method: 'SYNC_ACCOUNTS' })
        .then(({ accounts }) => {
          if (!accounts) return
          if (JSON.stringify(this.state.accounts) === JSON.stringify(accounts)) return

          this.state.accounts = accounts
          localStorage.accounts = accounts

          // Re-render with new accounts
          this.cleanup()
          this.render()
          const count = accounts.length
          showToast({ content: `${count} account${count === 1 ? '' : 's'} synced` })
        })
        .catch(() => {
          showToast({ content: 'Sync failed' })
        })
    },

    startTimer() {
      timer = createTimer(
        (remaining) => {
          if (bg) bg.update(remaining)
          if (timerArc) timerArc.update(remaining)
        },
        () => updateCodes()
      )
      timer.start()
    },

    cleanup() {
      UI.reset()
    },

    onDestroy() {
      keepScreenOn(false)
      if (timer) timer.stop()
      this.cleanup()
    },
})
