import { BasePage } from '@zeppos/zml/base-page'
import { setStatusBarVisible } from '@zos/ui'
import { showToast } from '@zos/interaction'
import { keepScreenOn } from './../../zeppify/screen.js'
import UI, { height } from './../../pages/ui.js'
import { localStorage } from './utils.js'
import { getTimeRemaining } from './libs/totp.js'
import * as hmUI from '@zos/ui'
import { Timer } from 'zosLoader:./components/timer.[pf].layout.js'
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

      // Create scrollable account list
      List(accounts)

      if (accounts.length === 0) return

      // Enable swiper scrolling
      hmUI.setScrollView(true, height / 3 | 0, accounts.length, true)
      hmUI.scrollToPage(1, false)

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
