import * as hmUI from '@zos/ui'
import { BasePage } from '@zeppos/zml/base-page'
import { keepScreenOn } from '../../../zeppify/index.js'
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

// Dump first n bytes of a Uint8Array as compact hex
function dumpHex(bytes, n) {
  if (!bytes) return 'null'
  var s = ''
  var limit = Math.min(bytes.length, n || 10)
  for (var i = 0; i < limit; i++) {
    s += ('0' + bytes[i].toString(16)).slice(-2)
  }
  if (bytes.length > limit) s += '..'
  return s
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

// ── pair flow ─────────────────────────────────────────────────────────────────
// Mirrors Tesla Go SDK exactly:
//   1. doPair()  — fire-and-forget SendAddKeyRequest (ToVCSECMessage, PRESENT_KEY)
//                  Tell user to watch car touchscreen and tap NFC key card.
//   2. doVerify() — on second PAIR press: query VCSEC whitelist for our key.
//                   Car returns whitelistEntryInfo (enrolled) or ERROR (not enrolled).

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
      addLog('TX[' + msgBytes.length + ']:' + dumpHex(msgBytes, 6), 0xaaaaaa)

      // Primary false-positive guard.
      // Set to true when car sends wlInfo=14 (tap required).
      // 'ok' is only accepted as genuine when sawTapRequired=true OR dbg.hasSigner=true.
      var sawTapRequired = false

      // Car should reply with wlInfo=14 (tap NFC) within 15s.
      teslaBLE.sendAndWaitForResponse(msgBytes, function(r) {
        if (!r.success) {
          addLog('PRX:timeout', 0x888888)
          return
        }
        addLog('RX[' + r.data.length + ']:' + dumpHex(r.data, 8), 0x888888)
        var parsed = parsePairingResponse(r.data)
        var dbg = parsed.dbg || {}
        var wlStr = dbg.wlFault ? ' wl:' + dbg.wlFault : ''
        var pathStr = dbg.path ? ' p:' + dbg.path : ''
        var keysStr = dbg.outerKeys ? ' k:' + dbg.outerKeys : ''
        addLog('PRX:' + parsed.status + wlStr + pathStr, 0x4488ff)
        addLog(keysStr || 'no keys', 0x666666)

        if (parsed.status === 'ok') {
          if (sawTapRequired || dbg.hasSigner) {
            // Save vehicle's EC public key if provided
            if (parsed.vehiclePublicKey && parsed.vehiclePublicKey.length === 65) {
              var pubKeyHex = ''
              for (var pk = 0; pk < parsed.vehiclePublicKey.length; pk++) {
                pubKeyHex += ('0' + parsed.vehiclePublicKey[pk].toString(16)).slice(-2)
              }
              storage.setItem('vehicle_ec_public_key', pubKeyHex)
              addLog('Saved vehicle EC key', 0x44ff44)
              console.log('[BLE] Vehicle public key saved:', pubKeyHex.slice(0, 16) + '...')
              // Precompute ECDH doublings table on phone while still connected
              currentPage.request({ method: 'BLE_PRECOMPUTE_TABLE', params: { vehiclePublicKeyHex: pubKeyHex } })
                .then(function(r) {
                  if (r.success && r.table) { storage.setItem('vehicle_doublings_table', r.table); console.log('[BLE] ECDH table stored') }
                })
                .catch(function() {})
            }

            state = 'DONE'
            updateStatus('PAIRED!', 0x00cc44)
            addLog('Key enrolled!', 0x00cc44)
          } else {
            // False positive — ambient push before NFC tap; keep waiting
            addLog('PRX:ok-skip(no tap)', 0xff8800)
            waitForResult()
          }
          return
        }

        if (parsed.status === 'wait') sawTapRequired = true

        if (parsed.status === 'wait' || parsed.status === 'pending') {
          waitForResult()
        }
      }, 15000)

      // Loops until ok (with valid tap/signer), error, or 60s timeout.
      // No depth limit — car may push many intermediate notifications.
      // sawTapRequired is captured by closure from the outer doPair() scope.
      function waitForResult() {
        teslaBLE.waitForNextResponse(60000, function(r2) {
          if (!r2.success) {
            addLog('NFC timeout', 0x888888)
            addLog('(press PAIR to verify)', 0x666666)
            return
          }
          addLog('RX[' + r2.data.length + ']:' + dumpHex(r2.data, 8), 0x888888)
          var p2 = parsePairingResponse(r2.data)
          var d2 = p2.dbg || {}
          var wl2 = d2.wlFault ? ' wl:' + d2.wlFault : ''
          addLog('NFC:' + p2.status + wl2 + (d2.path ? ' p:' + d2.path : ''), 0x4488ff)

          if (p2.status === 'wait') {
            sawTapRequired = true
            waitForResult()
          } else if (p2.status === 'pending') {
            waitForResult()
          } else if (p2.status === 'ok') {
            if (sawTapRequired || d2.hasSigner) {
              // Save vehicle's EC public key if provided
              if (p2.vehiclePublicKey && p2.vehiclePublicKey.length === 65) {
                var pubKeyHex = ''
                for (var pk = 0; pk < p2.vehiclePublicKey.length; pk++) {
                  pubKeyHex += ('0' + p2.vehiclePublicKey[pk].toString(16)).slice(-2)
                }
                storage.setItem('vehicle_ec_public_key', pubKeyHex)
                addLog('Saved vehicle EC key', 0x44ff44)
                console.log('[BLE] Vehicle public key saved:', pubKeyHex.slice(0, 16) + '...')
                // Precompute ECDH doublings table on phone while still connected
                currentPage.request({ method: 'BLE_PRECOMPUTE_TABLE', params: { vehiclePublicKeyHex: pubKeyHex } })
                  .then(function(r) {
                    if (r.success && r.table) { storage.setItem('vehicle_doublings_table', r.table); console.log('[BLE] ECDH table stored') }
                  })
                  .catch(function() {})
              }

              state = 'DONE'
              updateStatus('PAIRED!', 0x00cc44)
              addLog('Key enrolled!', 0x00cc44)
            } else {
              addLog('NFC:ok-skip(no tap)', 0xff8800)
              waitForResult()
            }
          } else if (p2.status === 'error') {
            state = 'IDLE'
            updateStatus('PAIR ERROR', 0xff4444)
            addLog(p2.error || 'Error', 0xff4444)
          }
        })
      }

      state = 'WAITING_KEYCARD'
      updateStatus('TAP KEY CARD', 0xff4444)
      addLog('TAP KEY CARD', 0xff4444)
      addLog('on center console!', 0xff8800)
      addLog('then press PAIR to verify', 0x888888)
    })
    .catch(function(err) {
      state = 'IDLE'
      updateStatus('ERROR', 0xff4444)
      addLog('Exc: ' + (err.message || '?'), 0xff4444)
    })
}

function doVerify() {
  if (!teslaBleApi.isConnected()) {
    state = 'IDLE'
    updateStatus('CONN LOST', 0xff4444)
    addLog('BLE dropped.', 0xff8800)
    addLog('Reconnect & retry', 0xff8800)
    return
  }
  updateStatus('QUERYING...', 0xffcc00)
  addLog('Querying whitelist...', 0xcccccc)

  currentPage.request({ method: 'BLE_VERIFY_PAIR', params: { publicKeyHex: TESLA_PUBLIC_KEY } })
    .then(function(result) {
      if (!result.success) {
        state = 'IDLE'
        updateStatus('ERROR', 0xff4444)
        addLog('Query build err: ' + (result.error || '?'), 0xff4444)
        return
      }
      var msgBytes = hexToBytes(result.messageHex)
      addLog('QTX[' + msgBytes.length + ']:' + dumpHex(msgBytes, 6), 0xaaaaaa)

      function handleQueryResponse(r, attempt) {
        if (!r.success) {
          state = 'IDLE'
          updateStatus('NO RESPONSE', 0xff8800)
          addLog('Query timeout', 0xff8800)
          return
        }
        var rx = r.data
        addLog('QRX[' + rx.length + ']:' + dumpHex(rx, 6), 0x4488ff)

        var fields = decodeRawFields(rx)
        var fkeys = Object.keys(fields).join(',')
        addLog('f:' + fkeys, 0x4488ff)

        // Field 3 only = keychainStatus push (car sends on CCCD enable and occasionally).
        // Skip up to 3 ambients and wait for the real query response.
        if (fkeys === '3' && attempt < 3) {
          addLog('Ambient#' + (attempt + 1) + ' skip', 0x888888)
          teslaBLE.waitForNextResponse(6000, function(r2) {
            handleQueryResponse(r2, attempt + 1)
          })
          return
        }

        if (fkeys === '3') {
          // Still only field 3 after 3 retries — car never responded to query
          state = 'IDLE'
          updateStatus('NO QUERY RESP', 0xff8800)
          addLog('Only ambients,', 0xff8800)
          addLog('no query resp', 0xff8800)
          return
        }

        if (fields[17]) {
          // whitelistEntryInfo (field 17) present — our key is in the whitelist
          state = 'DONE'
          updateStatus('PAIRED!', 0x00cc44)
          addLog('Key enrolled!', 0x00cc44)
          updateDeviceInfo()
        } else if (fields[4]) {
          // commandStatus (field 4) = not enrolled or error
          state = 'IDLE'
          updateStatus('NOT ENROLLED', 0xff4444)
          addLog('Not in whitelist', 0xff8800)
        } else {
          state = 'IDLE'
          updateStatus('NOT ENROLLED', 0xff4444)
          addLog('Tap key card first', 0xff8800)
        }
      }

      teslaBLE.sendAndWaitForResponse(msgBytes, function(r) {
        handleQueryResponse(r, 0)
      }, 8000)
    })
    .catch(function(err) {
      state = 'IDLE'
      updateStatus('ERROR', 0xff4444)
      addLog('Exc: ' + (err.message || '?'), 0xff4444)
    })
}

// Minimal protobuf field decoder — returns raw field map {fieldNum: bytes|number}
function decodeRawFields(data) {
  var fields = {}
  var offset = 0
  while (offset < data.length) {
    var tag = 0, shift = 0
    while (offset < data.length) {
      var b = data[offset++]
      tag |= (b & 0x7f) << shift
      if (!(b & 0x80)) break
      shift += 7
    }
    var fieldNum = tag >> 3
    var wireType = tag & 7
    if (wireType === 0) {
      var val = 0; shift = 0
      while (offset < data.length) {
        var b = data[offset++]
        val |= (b & 0x7f) << shift
        if (!(b & 0x80)) break
        shift += 7
      }
      fields[fieldNum] = val
    } else if (wireType === 2) {
      var len = 0; shift = 0
      while (offset < data.length) {
        var b = data[offset++]
        len |= (b & 0x7f) << shift
        if (!(b & 0x80)) break
        shift += 7
      }
      fields[fieldNum] = data.slice(offset, offset + len)
      offset += len
    } else { break }
  }
  return fields
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
  if (state === 'SCANNING' || state === 'CONNECTING' || state === 'PAIRING') {
    addLog('Busy: ' + state, 0xff8800)
    return
  }

  // Second press after sending pair TX: verify enrollment via whitelist query
  if (state === 'WAITING_KEYCARD') {
    doVerify()
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

  // Delay before connect so ZeppOS BLE stack can recover after a previous attempt
  setTimeout(function() { doConnect(mac, 0) }, 1500)
}

function doConnect(mac, attempt) {
  teslaBleApi.connect(mac, function(result) {
    if (!result.success) {
      if (attempt < 1) {
        // Auto-retry once — ZeppOS BLE stack often needs a second try
        addLog('Retry ' + (attempt + 2) + '...', 0xff8800)
        setTimeout(function() { doConnect(mac, attempt + 1) }, 2000)
        return
      }
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

    teslaBleApi.onDisconnect = function() {
      if (state === 'WAITING_KEYCARD' || state === 'PAIRING') {
        state = 'IDLE'
        updateStatus('DISCONNECTED', 0xff4444)
        addLog('BLE dropped - reconnect', 0xff8800)
      }
    }

    updateDeviceInfo()
    if (teslaBleApi.isConnected()) updateStatus('CONNECTED', 0x00cc44)
    addLog('BLE debug ready', 0xcccccc)
    keepScreenOn(true, 600000)
  },

  onDestroy() {
    keepScreenOn(false)
    teslaBleApi.disconnect()
  },

  onHide() {
    keepScreenOn(false)
    teslaBleApi.disconnect()
  }
}))
