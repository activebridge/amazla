import * as hmUI from '@zos/ui'
import { BasePage } from '@zeppos/zml/base-page'
import { keepScreenOn } from '../../../zeppify/index.js'
import { writeFileSync, readFileSync } from '@zos/fs'
import teslaSession from '../../lib/tesla-ble/session.js'

// Shared storage
var storage = {
  data: {},
  load: function() {
    try {
      var json = readFileSync({ path: 'ble_settings.txt', options: { encoding: 'utf8' } })
      this.data = json ? JSON.parse(json) : {}
    } catch (e) { this.data = {} }
  },
  getItem: function(key) { return this.data[key] || null },
  setItem: function(key, val) { this.data[key] = val; this.save() },
  save: function() {
    try {
      writeFileSync({ path: 'ble_settings.txt', data: JSON.stringify(this.data), options: { encoding: 'utf8' } })
    } catch (e) {}
  },
}

var statusTextWidget = null
var deviceInfoWidget = null
var logWidgets = []
var logLines  = ['', '', '', '', '', '', '', '']
var logColors = [0x666666, 0x666666, 0x666666, 0x666666, 0x666666, 0x666666, 0x666666, 0x666666]
var currentPage = null
var initialized = false

function addLog(msg, color) {
  console.log('[PASSIVE] ' + msg)
  var s = msg.length > 36 ? msg.slice(0, 36) : msg
  for (var i = 0; i < 7; i++) {
    logLines[i]  = logLines[i + 1]
    logColors[i] = logColors[i + 1]
  }
  logLines[7]  = s
  logColors[7] = color || 0x666666
  for (var j = 0; j < 8; j++) {
    if (logWidgets[j]) {
      logWidgets[j].setProperty(hmUI.prop.TEXT,  logLines[j])
      logWidgets[j].setProperty(hmUI.prop.COLOR, logColors[j])
    }
  }
}

function onFetchECKey() {
  var watchKey = storage.getItem('watch_public_key')
  if (!watchKey) {
    addLog('✗ No watch key - pair first', 0xff4444)
    return
  }
  
  if (!storage.getItem('tesla_ble_mac') && !storage.getItem('vehicle_mac')) {
    addLog('✗ No vehicle MAC - pair first', 0xff4444)
    return
  }
  
  addLog('▶ Connecting to vehicle...', 0xffcc00)
  console.log('[PASSIVE] ▶ Fetching EC key from vehicle')
  
  // Use session to request vehicle public key via BLE
  teslaSession.setStorage(storage)
  teslaSession.requestVehiclePublicKey(function(result) {
    if (result.success) {
      addLog('✓ EC key saved!', 0x00cc44)
      console.log('[PASSIVE] ✓ Vehicle EC key retrieved and saved')
      
      // Refresh component status
      setTimeout(function() {
        location.reload()
      }, 1000)
    } else {
      addLog('✗ Failed: ' + (result.error || '?'), 0xff4444)
      console.log('[PASSIVE] ✗ Error: ' + (result.error || 'unknown'))
    }
  })
}

function onConnectSession() {
  addLog('▶ Connecting to vehicle...', 0xffcc00)
  console.log('[PASSIVE] ▶ Establishing BLE session')
  
  teslaSession.setStorage(storage)
  teslaSession.requestSessionInfo(function(result) {
    if (result.success) {
      addLog('✓ Session & EC key OK!', 0x00cc44)
      console.log('[PASSIVE] ✓ Session established')
      console.log('[PASSIVE] Vehicle EC key obtained and saved')
    } else {
      addLog('✗ Session failed: ' + (result.error || '?'), 0xff4444)
      console.log('[PASSIVE] ✗ Error: ' + (result.error || 'unknown'))
    }
  })
}

// ── page ─────────────────────────────────────────────────────────────────────
Page(BasePage({
  build() {
    if (initialized) {
      console.log('[PASSIVE] ⚠ Build called again, ignoring to prevent double initialization')
      return
    }
    initialized = true
    
    storage.load()
    
    // Use the singleton session with shared storage
    teslaSession.setStorage(storage)

    // Title
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0, y: 18, w: 480, h: 36,
      text: 'PASSIVE ENTRY', text_size: 26, color: 0xffffff,
      align_h: hmUI.align.CENTER_H,
    })

    // Top separator
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 20, y: 54, w: 440, h: 2, color: 0x333333
    })

    // Status dot
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 50, y: 62, w: 14, h: 14, radius: 7, color: 0x888888
    })

    // Status text
    statusTextWidget = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 72, y: 60, w: 360, h: 22,
      text: 'IDLE', text_size: 20, color: 0x888888,
      align_h: hmUI.align.LEFT,
    })

    // Device info
    deviceInfoWidget = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 20, y: 94, w: 440, h: 24,
      text: '...', text_size: 18, color: 0x777777,
      align_h: hmUI.align.LEFT,
    })

    // Second separator
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 20, y: 122, w: 440, h: 1, color: 0x333333
    })

    // 8 log rows
    for (var i = 0; i < 8; i++) {
      logWidgets[i] = hmUI.createWidget(hmUI.widget.TEXT, {
        x: 20, y: 124 + i * 27, w: 440, h: 26,
        text: '', text_size: 20, color: 0x666666,
        align_h: hmUI.align.LEFT,
      })
    }

    // Bottom separator
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 20, y: 340, w: 440, h: 1, color: 0x333333
    })

    // Store reference to current page for request() calls
    currentPage = this

    // FETCH KEY button (no car needed - queries vehicle via phone BLE)
    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 20, y: 350, w: 90, h: 50,
      text: 'FETCH\nKEY', text_size: 14, color: 0xffffff,
      normal_color: 0x005588, press_color: 0x003344, radius: 8,
      click_func: onFetchECKey,
    })

    // CONNECT button
    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 120, y: 350, w: 90, h: 50,
      text: 'CONNECT', text_size: 14, color: 0xffffff,
      normal_color: 0x1a3a5c, press_color: 0x0d1f2d, radius: 8,
      click_func: onConnectSession,
    })

    // UNLOCK button
    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 220, y: 350, w: 90, h: 50,
      text: 'PRECOMP', text_size: 14, color: 0xffffff,
      normal_color: 0x1a5c2a, press_color: 0x0d2d15, radius: 8,
      click_func: function() { console.log('PRECOMP clicked') },
    })

    // LOCK button
    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 320, y: 350, w: 90, h: 50,
      text: 'CLEAR', text_size: 14, color: 0xffffff,
      normal_color: 0x5c3a00, press_color: 0x2d1d00, radius: 8,
      click_func: function() { console.log('CLEAR clicked') },
    })

    // Check components (don't load table into memory, just check if it exists)
    addLog('Checking components...', 0xcccccc)
    
    var watchKey = storage.getItem('watch_public_key')
    var ecKey = storage.getItem('vehicle_ec_public_key')
    var hasTable = !!storage.getItem('vehicle_doublings_table')
    var mac = storage.getItem('tesla_ble_mac') || storage.getItem('vehicle_mac')
    
    addLog((watchKey ? '✓' : '✗') + ' Watch key', watchKey ? 0x00cc44 : 0xff4444)
    addLog((ecKey ? '✓' : '✗') + ' Vehicle EC key', ecKey ? 0x00cc44 : 0xff4444)
    addLog((hasTable ? '✓' : '✗') + ' ECDH table', hasTable ? 0x00cc44 : 0xff4444)
    addLog((mac ? '✓' : '✗') + ' Vehicle MAC', mac ? 0x00cc44 : 0xff4444)

    keepScreenOn(true, 600000)
  },

  onDestroy() {
    keepScreenOn(false)
  },

  onHide() {
    keepScreenOn(false)
  }
}))
