import * as hmUI from '@zos/ui'
import { BasePage } from '@zeppos/zml/base-page'
import teslaBleApi, { teslaBLE } from '../../lib/tesla-ble/index.js'
import { parsePairingResponse } from '../../lib/tesla-ble/protocol/vcsec.js'
import { TESLA_PUBLIC_KEY } from '../../../secrets.js'
import { writeFileSync, readFileSync } from '@zos/fs'

// Lightweight inline storage (shares ble_settings.txt with ble-service)
var storage = {
  data: {},
  load: function() {
    try {
      var json = readFileSync({ path: 'ble_settings.txt', options: { encoding: 'utf8' } })
      this.data = json ? JSON.parse(json) : {}
    } catch (e) { this.data = {} }
  },
  save: function() {
    try {
      writeFileSync({ path: 'ble_settings.txt', data: JSON.stringify(this.data), options: { encoding: 'utf8' } })
    } catch (e) {}
  },
  getItem: function(key) { return this.data[key] || null },
  setItem: function(key, val) { this.data[key] = val; this.save() },
  removeItem: function(key) { delete this.data[key]; this.save() }
}

function hexToBytes(hex) {
  var bytes = new Uint8Array(hex.length / 2)
  for (var i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

// ── state ────────────────────────────────────────────────────────────────────
var state = 'IDLE'   // IDLE|SCANNING|CONNECTING|PAIRING|WAITING_KEYCARD|DONE
var foundMAC = null
var logLines  = ['', '', '', '', '', '', '', '']
var logColors = [0x666666, 0x666666, 0x666666, 0x666666, 0x666666, 0x666666, 0x666666, 0x666666]

var statusDotWidget  = null
var statusTextWidget = null
var deviceInfoWidget = null
var logWidgets       = []
var currentPage      = null

// ── helpers ──────────────────────────────────────────────────────────────────
function addLog(msg, color) {
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

function updateStatus(label, dotColor) {
  if (statusDotWidget)  statusDotWidget.setProperty(hmUI.prop.COLOR,  dotColor)
  if (statusTextWidget) {
    statusTextWidget.setProperty(hmUI.prop.TEXT,  label)
    statusTextWidget.setProperty(hmUI.prop.COLOR, dotColor)
  }
}

function updateDeviceInfo() {
  var s        = teslaBleApi.getStatus()
  var keyPart  = TESLA_PUBLIC_KEY ? TESLA_PUBLIC_KEY.slice(2, 10) : '--------'
  var savePart = (s.savedMAC && s.savedMAC.length >= 8) ? s.savedMAC.slice(-8) : '--------'
  var nowPart  = (s.mac && s.mac.length >= 8)           ? s.mac.slice(-8)      : '--------'
  if (deviceInfoWidget) deviceInfoWidget.setProperty(hmUI.prop.TEXT,
    'KEY:' + keyPart + ' SAVE:' + savePart + ' NOW:' + nowPart)
}

// ── pair flow (inline — avoids importing session.js + heavy crypto) ───────────
function _waitForPairingConfirmation() {
  addLog('Waiting for tap...', 0xffcc00)
  var tapTimeout = setTimeout(function() {
    teslaBLE.responseCallback = null
    state = 'IDLE'
    updateStatus('TIMEOUT', 0xff4444)
    addLog('Keycard tap timeout', 0xff4444)
  }, 60000)

  teslaBLE.responseCallback = function(result) {
    clearTimeout(tapTimeout)
    if (!result.success) {
      state = 'IDLE'
      updateStatus('ERROR', 0xff4444)
      addLog('Tap err: ' + (result.error || '?'), 0xff4444)
      return
    }
    var parsed = parsePairingResponse(result.data)
    if (parsed.status === 'ok') {
      state = 'DONE'
      updateStatus('PAIRED!', 0x00cc44)
      addLog('Key added!', 0x00cc44)
      updateDeviceInfo()
    } else {
      state = 'IDLE'
      updateStatus('ERROR', 0xff4444)
      addLog('Tap err: ' + (parsed.error || parsed.status || '?'), 0xff4444)
    }
  }
}

function doPair() {
  state = 'PAIRING'
  updateStatus('PAIRING...', 0xffcc00)
  addLog('Requesting pair msg...', 0xcccccc)

  currentPage.request({ method: 'BLE_PAIR', params: { publicKeyHex: TESLA_PUBLIC_KEY } })
    .then(function(result) {
      if (!result.success) {
        state = 'IDLE'
        updateStatus('ERROR', 0xff4444)
        addLog('Pair msg err: ' + (result.error || '?'), 0xff4444)
        return
      }
      var msgBytes = hexToBytes(result.messageHex)
      addLog('Sending ' + msgBytes.length + 'B...', 0xcccccc)

      teslaBLE.sendAndWaitForResponse(msgBytes, function(bleResult) {
        if (!bleResult.success) {
          state = 'IDLE'
          updateStatus('ERROR', 0xff4444)
          addLog('BLE err: ' + (bleResult.error || '?'), 0xff4444)
          return
        }
        var parsed = parsePairingResponse(bleResult.data)
        addLog('Status: ' + (parsed.status || '?'), 0xcccccc)

        if (parsed.status === 'wait') {
          state = 'WAITING_KEYCARD'
          updateStatus('TAP KEY CARD', 0xffcc00)
          addLog('TAP KEY CARD ON CAR', 0xff8800)
          _waitForPairingConfirmation()
        } else if (parsed.status === 'ok') {
          state = 'DONE'
          updateStatus('PAIRED!', 0x00cc44)
          addLog('Key added!', 0x00cc44)
          updateDeviceInfo()
        } else {
          state = 'IDLE'
          updateStatus('ERROR', 0xff4444)
          addLog('Err: ' + (parsed.error || '?'), 0xff4444)
        }
      }, 15000)
    })
    .catch(function(err) {
      state = 'IDLE'
      updateStatus('ERROR', 0xff4444)
      addLog('Exc: ' + (err.message || '?'), 0xff4444)
    })
}

// ── button handlers ──────────────────────────────────────────────────────────
function onScan() {
  if (state === 'SCANNING') return
  state    = 'SCANNING'
  foundMAC = null
  updateStatus('SCANNING...', 0xffcc00)
  addLog('Scanning 15s...', 0xcccccc)

  teslaBleApi.scan(function(result) {
    if (result.type === 'found') {
      var dev = result.device
      foundMAC = dev.mac || null
      addLog('FND: ' + (dev.name || '?'), 0x00cc44)
      if (foundMAC) addLog(foundMAC.slice(-17), 0x00cc44)
      teslaBleApi.stopScan()
      state = 'IDLE'
      updateStatus('FOUND', 0x00cc44)
    }
    if (result.type === 'complete') {
      if (state === 'SCANNING') {
        state = 'IDLE'
        var cnt = (result.devices && result.devices.length) || 0
        addLog('Done. Found: ' + cnt, 0xcccccc)
        updateStatus(foundMAC ? 'FOUND' : 'IDLE', foundMAC ? 0x00cc44 : 0x888888)
      }
    }
  }, 15000)
}

function onPair() {
  if (state === 'SCANNING' || state === 'CONNECTING' || state === 'PAIRING' || state === 'WAITING_KEYCARD') {
    addLog('Busy: ' + state, 0xff8800)
    return
  }

  if (teslaBleApi.isConnected()) {
    addLog('Already connected', 0xcccccc)
    doPair()
    return
  }

  var mac = foundMAC || teslaBleApi.savedMAC
  if (!mac) {
    addLog('No MAC - scan first', 0xff4444)
    return
  }

  state = 'CONNECTING'
  updateStatus('CONNECTING...', 0xffcc00)
  addLog('Connecting to:', 0xcccccc)
  addLog(mac.slice(-17), 0xcccccc)

  teslaBleApi.connect(mac, function(result) {
    if (!result.success) {
      state = 'IDLE'
      updateStatus('CONN FAIL', 0xff4444)
      addLog('Conn err: ' + (result.error || '?'), 0xff4444)
      return
    }
    addLog('Connected!', 0x00cc44)
    updateDeviceInfo()
    doPair()
  }, storage)
}

function onClear() {
  teslaBleApi.clear(storage)
  state    = 'IDLE'
  foundMAC = null
  updateStatus('CLEARED', 0x888888)
  updateDeviceInfo()
  addLog('Cleared & disconnected', 0x888888)
}

// ── page ─────────────────────────────────────────────────────────────────────
Page(BasePage({
  build() {
    currentPage = this
    storage.load()
    teslaBleApi.init(storage)

    // Title
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0, y: 18, w: 480, h: 36,
      text: 'BLE DEBUG', text_size: 26, color: 0xffffff,
      align_h: hmUI.align.CENTER_H,
    })

    // Top separator
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 20, y: 54, w: 440, h: 2, color: 0x333333
    })

    // Status dot
    statusDotWidget = hmUI.createWidget(hmUI.widget.FILL_RECT, {
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

    // 8 log rows (y=124, step=27)
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

    // SCAN button
    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 35, y: 350, w: 120, h: 50,
      text: 'SCAN', text_size: 20, color: 0xffffff,
      normal_color: 0x1a3a5c, press_color: 0x0d1f2d, radius: 12,
      click_func: onScan,
    })

    // PAIR button
    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 180, y: 350, w: 120, h: 50,
      text: 'PAIR', text_size: 20, color: 0xffffff,
      normal_color: 0x1a5c2a, press_color: 0x0d2d15, radius: 12,
      click_func: onPair,
    })

    // CLEAR button
    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 325, y: 350, w: 120, h: 50,
      text: 'CLEAR', text_size: 20, color: 0xffffff,
      normal_color: 0x5c1a1a, press_color: 0x2d0d0d, radius: 12,
      click_func: onClear,
    })

    updateDeviceInfo()
    if (teslaBleApi.isConnected()) updateStatus('CONNECTED', 0x00cc44)
    addLog('BLE debug ready', 0xcccccc)
  }
}))
