import { keepScreenOn } from './../shared/screen.js'
import UI, { height, isRound, isV1 } from './../../pages/ui.js'
import { localStorage } from './utils.js'
import { Timer } from './components/timer.js'
import { Background } from './components/background.js'
import { List, updateCodes, STEP, TOP_OFFSET } from './components/list.js'
import { getTimeRemaining } from './libs/totp.js'
import { createTimer } from './../shared/timer.js'

let timer = null
let indicator = null
let bg = null

// Read lazily — globalData.messageBuilder is set in app.onCreate, and a
// module-eval snapshot would capture the initial null.
const getMessageBuilder = () => getApp()._options.globalData.messageBuilder

Page({
    state: {
      accounts: localStorage.accounts,
    },

    build() {
      // Square API-1.0 watches keep the bar: it carries the countdown.
      if (!(isV1 && !isRound)) hmUI.setStatusBarVisible(false)
      keepScreenOn(true)

      this.render()
      this.startTimer()
      setTimeout(() => this.sync(), 1000)
    },

    render() {
      const { accounts } = this.state
      const n = accounts.length

      // Gradient background, behind the cards, covering the whole scroll extent.
      // Created before the list so it draws underneath.
      if (n > 0) {
        bg = Background(n * STEP + height + TOP_OFFSET)
        bg.update(getTimeRemaining())
      }

      // Create scrollable account list
      List(accounts)

      if (n === 0) return

      // Cap at n pages so you can't scroll past the last card into an empty page
      // below the heart.
      const pages = Math.max(1, n)
      hmUI.setScrollView(true, STEP, pages, true)
      // Page 0 is the heart; open on the first card, with the heart a swipe above.
      hmUI.scrollToPage(Math.min(1, pages - 1), false)

      // Countdown indicator: arc, bar, status-bar title or nothing (by device)
      indicator = Timer()
      indicator.update(getTimeRemaining())
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
          hmUI.showToast({ content: count + ' account' + (count === 1 ? '' : 's') + ' synced' })
        })
        .catch(() => {
          hmUI.showToast({ content: 'Sync failed' })
        })
    },

    startTimer() {
      timer = createTimer(
        (remaining) => {
          if (bg) bg.update(remaining)
          if (indicator) indicator.update(remaining)
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
