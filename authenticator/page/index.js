import { createWidget, widget, prop, align, text_style } from '@zos/ui'
import { localStorage } from '@zos/storage'
import { getDeviceInfo } from '@zos/device'
import { generateTOTP, getTimeRemaining, formatCode } from './libs/totp'

const { width: DEVICE_WIDTH } = getDeviceInfo()

Page({
  state: {
    accounts: [],
    widgets: [],
    timerWidget: null,
    updateTimer: null
  },

  build() {
    // Load cached accounts
    this.loadAccounts()

    // Render UI
    this.renderUI()

    // Start update timer
    this.startUpdateTimer()
  },

  loadAccounts() {
    try {
      const data = localStorage.getItem('accounts')
      this.state.accounts = data ? JSON.parse(data) : []
    } catch {
      this.state.accounts = []
    }
  },

  saveAccounts(accounts) {
    try {
      localStorage.setItem('accounts', JSON.stringify(accounts))
    } catch {}
  },

  renderUI() {
    // Header
    createWidget(widget.TEXT, {
      x: 0,
      y: 20,
      w: DEVICE_WIDTH,
      h: 36,
      text: 'Authenticator',
      text_size: 24,
      color: 0xffffff,
      align_h: align.CENTER_H
    })

    // Timer arc background
    createWidget(widget.ARC, {
      x: DEVICE_WIDTH / 2 - 20,
      y: 60,
      w: 40,
      h: 40,
      start_angle: 0,
      end_angle: 360,
      color: 0x333333,
      line_width: 4
    })

    // Timer arc (progress)
    this.state.timerWidget = createWidget(widget.ARC, {
      x: DEVICE_WIDTH / 2 - 20,
      y: 60,
      w: 40,
      h: 40,
      start_angle: -90,
      end_angle: -90,
      color: 0x1a73e8,
      line_width: 4
    })

    // Render accounts list
    this.renderAccounts()
  },

  renderAccounts() {
    // Clear existing account widgets
    this.state.widgets.forEach(w => w && w.setProperty && w.setProperty(prop.VISIBLE, false))
    this.state.widgets = []

    const startY = 120
    const itemHeight = 80

    if (this.state.accounts.length === 0) {
      const emptyText = createWidget(widget.TEXT, {
        x: 20,
        y: startY + 40,
        w: DEVICE_WIDTH - 40,
        h: 60,
        text: 'No accounts.\nImport from phone settings.',
        text_size: 16,
        color: 0x888888,
        align_h: align.CENTER_H,
        text_style: text_style.WRAP
      })
      this.state.widgets.push(emptyText)
      return
    }

    this.state.accounts.forEach((acc, i) => {
      const y = startY + i * itemHeight
      const code = generateTOTP(acc.secret, acc.digits || 6)

      // Account name
      const nameWidget = createWidget(widget.TEXT, {
        x: 20,
        y: y,
        w: DEVICE_WIDTH - 40,
        h: 24,
        text: acc.issuer ? `${acc.issuer}` : acc.name,
        text_size: 14,
        color: 0x888888,
        align_h: align.CENTER_H
      })

      // TOTP code
      const codeWidget = createWidget(widget.TEXT, {
        x: 20,
        y: y + 24,
        w: DEVICE_WIDTH - 40,
        h: 40,
        text: formatCode(code),
        text_size: 32,
        color: 0x1a73e8,
        align_h: align.CENTER_H
      })

      this.state.widgets.push(nameWidget, codeWidget)
    })
  },

  startUpdateTimer() {
    this.state.updateTimer = setInterval(() => {
      this.updateTimerUI()
      this.updateCodes()
    }, 1000)
  },

  updateTimerUI() {
    const remaining = getTimeRemaining()
    const progress = (remaining / 30) * 360

    if (this.state.timerWidget) {
      const color = remaining <= 5 ? 0xd93025 : 0x1a73e8
      this.state.timerWidget.setProperty(prop.MORE, {
        start_angle: -90,
        end_angle: -90 + progress,
        color: color
      })
    }
  },

  updateCodes() {
    const remaining = getTimeRemaining()
    // Only update codes when timer resets
    if (remaining === 30) {
      this.renderAccounts()
    }
  },

  onDestroy() {
    if (this.state.updateTimer) {
      clearInterval(this.state.updateTimer)
    }
  }
})
