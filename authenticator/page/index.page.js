import { BasePage } from '@zeppos/zml/base-page'
import { setStatusBarVisible } from '@zos/ui'
import { showToast } from '@zos/interaction'
import { keepScreenOn } from './../../zeppify/screen.js'
import UI, { screenShape } from './../../pages/ui.js'
import { localStorage } from './utils.js'
import { getTimeRemaining } from './libs/totp.js'
import { setScrollMode, scrollTo, SCROLL_MODE_FREE, SCROLL_MODE_SWIPER } from '@zos/page'
import { Timer } from 'zosLoader:./components/timer.[pf].layout.js'
import { List, updateCodes, STEP } from './components/list.js'
import vibrate from './../../pages/vibrate.js'


let app = null
let timerInterval = null
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

      // Enable scrolling: swiper for round, free for square
      if (screenShape === 0) {
        setScrollMode({ mode: SCROLL_MODE_FREE })
      } else {
        setScrollMode({ mode: SCROLL_MODE_SWIPER, options: { height: STEP, count: accounts.length + 2 } })
      }
      scrollTo({ y: -STEP })

      // Create timer arc
      timerArc = Timer()

      // Initial timer update
      this.updateTimer()
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
      timerInterval = setInterval(() => {
        this.updateTimer()
        this.checkCodeRefresh()
      }, 1000)
    },

    updateTimer() {
      if (!timerArc) return
      const remaining = getTimeRemaining()
      timerArc.update(remaining)
    },

    checkCodeRefresh() {
      const remaining = getTimeRemaining()
      if (remaining === 30) {
        // Codes just refreshed, update the list
        updateCodes()
        vibrate()
      }
    },

    cleanup() {
      UI.reset()
    },

    onDestroy() {
      keepScreenOn(false)
      if (timerInterval) {
        clearInterval(timerInterval)
        timerInterval = null
      }
      this.cleanup()
    },
  })
)
