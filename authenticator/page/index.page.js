import { BasePage } from '@zeppos/zml/base-page'
import { setStatusBarVisible } from '@zos/ui'
import { setScrollMode, SCROLL_MODE_SWIPER } from '@zos/page'
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
      this.sync()
      this.startTimer()
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

      // Enable swiper scrolling (page-based, 3 cards per page)
      setScrollMode({
        mode: SCROLL_MODE_SWIPER,
        options: {
          height: height / 3 | 0,
          count: accounts.length,
        },
      })

      // Create timer arc and fade overlay
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
        })
        .catch((error) => {
          console.log('Sync error:', error)
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
      if (timerInterval) {
        clearInterval(timerInterval)
        timerInterval = null
      }
      this.cleanup()
    },
  })
)
