import { push } from '@zos/router'
import { height, width, button } from './../../pages/ui.js'
import { keepScreenOn } from './../../zeppify/screen.js'
import { localStorage } from './../page/utils.js'
import { Layout, refreshCodes, updateAccounts } from 'zosLoader:./index.[pf].layout.js'
import { createTimer } from './../shared/timer.js'

let timer = null
let page = 0

SecondaryWidget({
  onInit() {
    this.accounts = localStorage.accounts || []
    page = 0
  },

  build() {
    keepScreenOn(true)
    const accounts = this.accounts.slice(0, 6)

    this.layout = Layout(accounts)

    // Click to cycle through accounts or open app
    button({
      w: width,
      h: height,
      src: 'black',
      click_func: () => this.onTap(),
    })

    this.startTimer()
  },

  onTap() {
    const pageSize = 6
    const totalPages = Math.ceil(this.accounts.length / pageSize)

    if (totalPages <= 1) {
      push({ url: 'page/index.page' })
    } else {
      page = (page + 1) % totalPages
      const start = page * pageSize
      const accounts = this.accounts.slice(start, start + pageSize)
      updateAccounts(accounts)
    }
  },

  startTimer() {
    timer = createTimer(
      (remaining) => { if (this.layout && this.layout.updateTimer) this.layout.updateTimer(remaining) },
      () => refreshCodes()
    )
    timer.start()
  },

  onResume() {
    refreshCodes()
  },

  onDestroy() {
    keepScreenOn(false)
    if (timer) timer.stop()
  },
})
