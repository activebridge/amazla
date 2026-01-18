import { BasePage } from '@zeppos/zml/base-page'
import { setStatusBarVisible } from '@zos/ui'
import { showToast, onGesture, offGesture, GESTURE_UP, GESTURE_DOWN } from '@zos/interaction'
import { keepScreenOn } from './../../zeppify/screen.js'
import UI, { text, width, height } from './../../pages/ui.js'
import { localStorage } from './utils.js'
import { getTimeRemaining } from './libs/totp.js'
import * as hmUI from '@zos/ui'
import { Timer, stopSpinner } from './components/timer.js'
import { List, updateCodes } from './components/list.js'


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

      if (accounts.length === 0) {
        text({
          y: 0,
          w: width - 40,
          h: height,
          text: 'No accounts.\nOpen phone settings\nto add accounts.',
          text_size: 18,
          color: 0x888888,
        })
        // timerArc = Timer()
        return
      }

      // Create scrollable account list
      List(accounts)

      // Enable swiper scrolling (n + 4 pages: 2 top placeholders, n real, 2 bottom placeholders)
      const n = accounts.length
      this.accountCount = n
      hmUI.setScrollView(true, height / 3 | 0, n + 4, true)

      // Start at first real card (scroll target = 2)
      hmUI.scrollToPage(2, false)

      // Listen for swipe gestures to handle loop
      onGesture({
        callback: (g) => (this.checkScrollLoop(g), false),
      })

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

    checkScrollLoop(g) {
      const n = this.accountCount
      if (n < 2) return

      const p = hmUI.getScrollCurrentPage()
      const t = g === GESTURE_UP && p >= n + 2 ? 1
        : g === GESTURE_DOWN && p === 2 ? n + 1
        : g === GESTURE_DOWN && p === 1 ? n
        : null

      if (t) {
        hmUI.setScrollView(false)
        hmUI.setScrollView(true, height / 3 | 0, n + 4, true)
        setTimeout(() => hmUI.scrollToPage(t, false), 50)
      }
    },

    updateTimer() {
      if (!timerArc) return
      const remaining = getTimeRemaining()
      timerArc.setProperty(hmUI.prop.MORE, {
        start_angle: -90 + (remaining / 30) * 360,
        end_angle: 270,
      })
    },

    checkCodeRefresh() {
      const remaining = getTimeRemaining()
      if (remaining === 30) {
        // Codes just refreshed, update the list
        updateCodes()
      }
    },

    cleanup() {
      stopSpinner()
      UI.reset()
    },

    onDestroy() {
      keepScreenOn(false)
      offGesture()
      if (timerInterval) {
        clearInterval(timerInterval)
        timerInterval = null
      }
      this.cleanup()
    },
  })
)
