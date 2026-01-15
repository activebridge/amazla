import { BasePage } from '@zeppos/zml/base-page'
import { setStatusBarVisible } from '@zos/ui'
import { setScrollMode, SCROLL_MODE_SWIPER } from '@zos/page'
import { keepScreenOn } from './../../zeppify/screen.js'
import { text, width, height } from './../../pages/ui.js'
import { localStorage } from './utils.js'
import { getTimeRemaining } from './libs/totp.js'
import { createTimerArc, updateTimerArc, destroyTimerArc } from './components/arc.js'
import { createAccountList, updateAccountCodes, destroyAccountList, generateCodesAsync, SNAP_HEIGHT } from './components/list.js'
import { createFadeOverlay, destroyFadeOverlay } from './components/fade.js'

let app = null
let updateTimer = null

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
        createTimerArc()
        return
      }

      // Create scrollable account list first
      createAccountList(accounts)

      // Enable swiper scrolling (uses crown/bezel - works with VIEW_CONTAINER)
      setScrollMode({
        mode: SCROLL_MODE_SWIPER,
        options: {
          height: SNAP_HEIGHT,
          count: accounts.length,
        },
      })

      // Create timer arc
      createTimerArc()

      // Create fade overlay last for highest z-index
      createFadeOverlay()

      // Initial timer update
      this.updateTimer()

      // Generate TOTP codes async (UI shows placeholders first)
      generateCodesAsync(accounts)
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
      updateTimer = setInterval(() => {
        this.updateTimer()
        this.checkCodeRefresh()
      }, 1000)
    },

    updateTimer() {
      const remaining = getTimeRemaining()
      updateTimerArc(remaining)
    },

    checkCodeRefresh() {
      const remaining = getTimeRemaining()
      if (remaining === 30) {
        // Codes just refreshed, update the list
        updateAccountCodes(this.state.accounts)
      }
    },

    cleanup() {
      destroyFadeOverlay()
      destroyTimerArc()
      destroyAccountList()
    },

    onDestroy() {
      keepScreenOn(false)
      if (updateTimer) {
        clearInterval(updateTimer)
        updateTimer = null
      }
      this.cleanup()
    },
  })
)
