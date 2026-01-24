import { BasePage } from '@zeppos/zml/base-page'
import { setStatusBarVisible } from '@zos/ui'
import * as hmUI from '@zos/ui'
import { showToast } from '@zos/interaction'
import { keepScreenOn } from './../../zeppify/screen.js'
import UI, { screenShape, height } from './../../pages/ui.js'
import { localStorage } from './utils.js'
import { setScrollMode, SCROLL_MODE_SWIPER } from '@zos/page'
import { Timer } from 'zosLoader:./components/timer.[pf].layout.js'
import { List, updateCodes, STEP } from './components/list.js'
import { createTimer } from './../shared/timer.js'

let app = null
let timer = null
let timerArc = null

Page(
  BasePage({
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
      this.request({ method: 'SYNC_ACCOUNTS' })
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
        (remaining) => { if (timerArc) timerArc.update(remaining) },
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
)
