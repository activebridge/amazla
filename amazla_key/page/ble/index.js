import { BasePage } from '@zeppos/zml/base-page'
import * as hmUI from '@zos/ui'
import UI, { button as uiButton, rect as uiRect, text as uiText } from '../../../pages/ui.js'
import { keepScreenOn } from '../../../zeppify/index.js'
import store from '../../lib/store.js'
import { binaryStringToBytes, bytesToBinaryString } from '../../lib/tesla-ble/crypto/binary-utils.js'
import teslaBleApi, { teslaBLE } from '../../lib/tesla-ble/index.js'
import { parsePairingResponse } from '../../lib/tesla-ble/protocol/vcsec-pairing.js'
import teslaSession from '../../lib/tesla-ble/session.js'

// Store initialization flag on the imported module (survives re-evaluation)
if (teslaBleApi.__blePageInit === undefined) {
  teslaBleApi.__blePageInit = false
}

function dumpHex(bytes, n) {
  if (!bytes) return 'null'
  var s = '',
    limit = Math.min(bytes.length, n || 10)
  for (var i = 0; i < limit; i++) s += `0${bytes[i].toString(16)}`.slice(-2)
  if (bytes.length > limit) s += '..'
  return s
}
var state = 'IDLE'
var foundMAC = null
var logLines = ['', '', '', '', '', '']
var logColors = [0x666666, 0x666666, 0x666666, 0x666666, 0x666666, 0x666666]
var currentPage = null
var activeTimers = []
var __pageBuilt = false // Prevent duplicate builds
var statusDotWidget = null
var statusTextWidget = null
var chkKeyWidget = null
var chkECWidget = null
var chkTableWidget = null
var chkPoolWidget = null
var chkMacWidget = null
var logWidgets = []
function addLog(msg, color) {
  console.log(`[BLE] ${msg}`)
  var s = msg.length > 36 ? msg.slice(0, 36) : msg
  for (var i = 0; i < 5; i++) {
    logLines[i] = logLines[i + 1]
    logColors[i] = logColors[i + 1]
  }
  logLines[5] = s
  logColors[5] = color || 0x666666
  for (var j = 0; j < 6; j++) {
    if (logWidgets[j]) {
      logWidgets[j].setProperty(hmUI.prop.TEXT, logLines[j])
      logWidgets[j].setProperty(hmUI.prop.COLOR, logColors[j])
    }
  }
}
function updateStatus(label, dotColor) {
  if (statusDotWidget) statusDotWidget.setProperty(hmUI.prop.COLOR, dotColor)
  if (statusTextWidget) {
    statusTextWidget.setProperty(hmUI.prop.TEXT, label)
    statusTextWidget.setProperty(hmUI.prop.COLOR, dotColor)
  }
}
function scheduleTimeout(fn, delay) {
  var id = setTimeout(fn, delay)
  activeTimers.push(id)
  return id
}
function clearAllTimers() {
  for (var i = 0; i < activeTimers.length; i++) {
    clearTimeout(activeTimers[i])
  }
  activeTimers = []
}
function updateChecklist() {
  var watchKey = store.watchPublicKey
  var ecKey = store.vehicleEcPublicKey
  var hasTable = store.hasDoublingsTable
  var mac = store.vehicleMac
  var poolSize = store.keyPoolCount
  var vehicleName = store.vehicleName
  var vehicleVin = store.vehicleVin
  if (chkKeyWidget)
    chkKeyWidget.setProperty(hmUI.prop.TEXT, `${watchKey ? '✓' : '✗'} KEY:${watchKey ? watchKey.length : '---'}b`)
  if (chkECWidget) chkECWidget.setProperty(hmUI.prop.TEXT, `${ecKey ? '✓' : '✗'} EC:${ecKey ? ecKey.length : '---'}b`)
  if (chkTableWidget) chkTableWidget.setProperty(hmUI.prop.TEXT, `${hasTable ? '✓' : '✗'} TABLE`)
  if (chkPoolWidget) chkPoolWidget.setProperty(hmUI.prop.TEXT, `POOL:${poolSize}`)
  if (chkMacWidget) {
    var hasVehicle = !!(vehicleName && vehicleVin)
    if (hasVehicle) {
      chkMacWidget.setProperty(hmUI.prop.TEXT, `✓ ${vehicleName} ${vehicleVin}`)
    } else {
      var vtxt = vehicleName ? vehicleName : vehicleVin ? vehicleVin : (mac ? `MAC:${mac.slice(-11)}` : 'MAC:---')
      chkMacWidget.setProperty(hmUI.prop.TEXT, `✗ ${vtxt}`)
    }
    chkMacWidget.setProperty(hmUI.prop.COLOR, hasVehicle ? 0x44cc66 : 0xff5555)
  }
  if (chkKeyWidget) chkKeyWidget.setProperty(hmUI.prop.COLOR, watchKey ? 0x44cc66 : 0xff5555)
  if (chkECWidget) chkECWidget.setProperty(hmUI.prop.COLOR, ecKey ? 0x44cc66 : 0xff5555)
  if (chkTableWidget) chkTableWidget.setProperty(hmUI.prop.COLOR, hasTable ? 0x44cc66 : 0xff5555)
  if (chkPoolWidget) chkPoolWidget.setProperty(hmUI.prop.COLOR, poolSize > 0 ? 0x44cc66 : 0xff8833)
}
function doPair() {
  state = 'PAIRING'
  updateStatus('PAIRING...', 0xffcc00)
  var watchKey = store.watchPublicKey
  if (!watchKey) {
    state = 'IDLE'
    updateStatus('NO KEY', 0xff4444)
    addLog('No watch key - GENKEY first', 0xff4444)
    return
  }
  currentPage
    .request({ method: 'BLE_PAIR', params: { publicKeyBinary: watchKey } })
    .then((result) => {
      if (!result.success) {
        state = 'IDLE'
        updateStatus('ERROR', 0xff4444)
        addLog(`Pair msg err: ${result.error || '?'}`, 0xff4444)
        return
      }
      var msgBytes = binaryStringToBytes(result.message)
      addLog(`TX[${msgBytes.length}]:${dumpHex(msgBytes, 6)}`, 0xaaaaaa)
      var sawTapRequired = false
      teslaBLE.sendAndWaitForResponse(
        msgBytes,
        (r) => {
          if (!r.success) {
            addLog('Timeout - trying verify...', 0x888888)
            state = 'DONE'
            updateStatus('Fetch EC key', 0xffcc00)
            scheduleTimeout(() => {
              doVerify()
            }, 1000)
            return
          }
          addLog(`RX[${r.data.length}]:${dumpHex(r.data, 8)}`, 0x888888)
          var parsed = parsePairingResponse(r.data)
          var dbg = parsed.dbg || {}
          addLog(`PRX:${parsed.status}${dbg.wlFault ? ` wl:${dbg.wlFault}` : ''}`, 0x4488ff)
          if (parsed.status === 'ok') {
            if (sawTapRequired || dbg.hasSigner) {
              state = 'DONE'
              updateStatus('PAIRED!', 0x00cc44)
              addLog('✓ Paired!', 0x44ff44)
              scheduleTimeout(() => {
                doVerify()
              }, 500)
            } else {
              addLog('Waiting for tap...', 0xff8800)
              waitForResult()
            }
            return
          }
          if (parsed.status === 'wait') sawTapRequired = true
          if (parsed.status === 'wait' || parsed.status === 'pending') waitForResult()
        },
        15000,
      )
      function waitForResult() {
        teslaBLE.waitForNextResponse(60000, (r2) => {
          if (!r2.success) {
            addLog('NFC timeout', 0x888888)
            return
          }
          addLog(`RX[${r2.data.length}]:${dumpHex(r2.data, 8)}`, 0x888888)
          var p2 = parsePairingResponse(r2.data),
            d2 = p2.dbg || {}
          addLog(`NFC:${p2.status}${d2.wlFault ? ` wl:${d2.wlFault}` : ''}`, 0x4488ff)
          if (p2.status === 'wait') {
            sawTapRequired = true
            waitForResult()
          } else if (p2.status === 'pending') {
            waitForResult()
          } else if (p2.status === 'ok') {
            if (sawTapRequired || d2.hasSigner) {
              state = 'DONE'
              updateStatus('PAIRED!', 0x00cc44)
              scheduleTimeout(() => {
                doVerify()
              }, 500)
            } else {
              addLog('ok-skip(no tap)', 0xff8800)
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
      addLog('TAP KEY CARD on console!', 0xff4444)
    })
    .catch((err) => {
      state = 'IDLE'
      updateStatus('ERROR', 0xff4444)
      addLog(`Exc: ${err.message || '?'}`, 0xff4444)
    })
}
function doVerify() {
  if (!teslaBleApi.isConnected()) {
    state = 'IDLE'
    updateStatus('CONN LOST', 0xff4444)
    addLog('BLE dropped - reconnect', 0xff8800)
    return
  }
  updateStatus('QUERYING...', 0xffcc00)
  var watchKey = store.watchPublicKey
  if (!watchKey) {
    addLog('No watch key', 0xff4444)
    return
  }
  currentPage
    .request({ method: 'BLE_VERIFY_PAIR', params: { publicKeyBinary: watchKey } })
    .then((result) => {
      if (!result.success) {
        state = 'IDLE'
        updateStatus('ERROR', 0xff4444)
        addLog(`Query err: ${result.error || '?'}`, 0xff4444)
        return
      }
      var msgBytes = binaryStringToBytes(result.message)
      function handleQueryResponse(r, attempt) {
        if (!r.success) {
          state = 'IDLE'
          updateStatus('NO RESPONSE', 0xff8800)
          addLog('Query timeout', 0xff8800)
          return
        }
        var fields = decodeRawFields(r.data)
        var fkeys = Object.keys(fields).join(',')
        addLog(`f:${fkeys}`, 0x4488ff)
        if (fkeys === '3' && attempt < 3) {
          addLog(`Ambient#${attempt + 1} skip`, 0x888888)
          teslaBLE.waitForNextResponse(6000, (r2) => {
            handleQueryResponse(r2, attempt + 1)
          })
          return
        }
        if (!fields[17]) {
          state = 'IDLE'
          updateStatus('NOT ENROLLED', 0xff4444)
          addLog('Not in whitelist', 0xff8800)
          return
        }
        var ecKey = null
        var wei = decodeRawFields(fields[17])
        if (wei[2]) {
          var pk = decodeRawFields(wei[2])
          if (pk[1] && pk[1].length === 65) ecKey = pk[1]
        }
        if (ecKey) {
          store.vehicleEcPublicKey = ecKey
          addLog('✓ EC key saved', 0x44ff44)
          addLog('Computing table...', 0x666666)
          currentPage
            .request({ method: 'BLE_PRECOMPUTE_TABLE', params: { vehiclePublicKeyBinary: bytesToBinaryString(ecKey) } })
            .then((r) => {
              if (r.success && r.table) {
                store.vehicleDoublingsTable = binaryStringToBytes(r.table)
                addLog('✓ Table saved', 0x44ff44)
              } else {
                addLog(`Table failed: ${r.error || '?'}`, 0xffaa44)
              }
              addLog('Generating key pool...', 0x666666)
              return currentPage.request({ method: 'BLE_GENERATE_SESSION_KEYS', params: { count: 20 } })
            })
            .then((r) => {
              if (r.success && r.pool) {
                store.keyPool = binaryStringToBytes(r.pool)
                addLog('✓ Pool:20 keys ready', 0x44ff44)
              } else {
                addLog(`Pool gen failed: ${r.error || '?'}`, 0xffaa44)
              }
              updateChecklist()
            })
            .catch((e) => {
              addLog(`Setup err: ${e}`, 0xff8844)
              updateChecklist()
            })
        } else {
          addLog('No EC key in WEI', 0xff8800)
        }
        state = 'DONE'
        updateStatus('PAIRED!', 0x00cc44)
        addLog('Key enrolled!', 0x00cc44)
        updateChecklist()
      }
      teslaBLE.sendAndWaitForResponse(
        msgBytes,
        (r) => {
          handleQueryResponse(r, 0)
        },
        8000,
      )
    })
    .catch((err) => {
      state = 'IDLE'
      updateStatus('ERROR', 0xff4444)
      addLog(`Exc: ${err.message || '?'}`, 0xff4444)
    })
}
function decodeRawFields(data) {
  var fields = {},
    offset = 0
  while (offset < data.length) {
    var tag = 0,
      shift = 0
    while (offset < data.length) {
      var b = data[offset++]
      tag |= (b & 0x7f) << shift
      if (!(b & 0x80)) break
      shift += 7
    }
    var fieldNum = tag >> 3,
      wireType = tag & 7
    if (wireType === 0) {
      var val = 0
      shift = 0
      while (offset < data.length) {
        var b = data[offset++]
        val |= (b & 0x7f) << shift
        if (!(b & 0x80)) break
        shift += 7
      }
      fields[fieldNum] = val
    } else if (wireType === 2) {
      var len = 0
      shift = 0
      while (offset < data.length) {
        var b = data[offset++]
        len |= (b & 0x7f) << shift
        if (!(b & 0x80)) break
        shift += 7
      }
      fields[fieldNum] = data.slice(offset, offset + len)
      offset += len
    } else {
      break
    }
  }
  return fields
}
function onGenKey() {
  addLog('Generating keys...', 0xffcc00)
  currentPage
    .request({ method: 'BLE_SYNC_KEYS', params: { forceNew: true } })
    .then((result) => {
      if (result.success && result.publicKeyBinary) {
        // Store binary string directly
        store.watchPublicKey = result.publicKeyBinary
        addLog('✓ Watch key ready', 0x44ff44)
        addLog('Generating pool...', 0x888888)
        currentPage
          .request({ method: 'BLE_GENERATE_SESSION_KEYS', params: { count: 5 } })
          .then((r) => {
            if (r.success && r.pool) {
              store.keyPool = binaryStringToBytes(r.pool)
              addLog('✓ Pool:5 keys ready', 0x44ff44)
            } else {
              addLog('Pool gen failed', 0xff8800)
            }
            updateStatus('READY', 0x00cc44)
            updateChecklist()
          })
          .catch(() => {
            updateChecklist()
          })
      } else {
        addLog('Key gen failed', 0xff8844)
      }
    })
    .catch((e) => {
      addLog(`Key err: ${e}`, 0xff8844)
    })
}
function onPair() {
  if (state === 'SCANNING' || state === 'CONNECTING' || state === 'PAIRING' || state === 'WAITING_KEYCARD') {
    addLog(`Busy: ${state}`, 0xff8800)
    return
  }
  addLog('Starting pairing...', 0xffcc00)
  var savedMAC = store.vehicleMac || teslaBleApi.savedMAC
  if (savedMAC) {
    doConnect(savedMAC, 0, doPair)
    return
  }
  state = 'SCANNING'
  updateStatus('SCANNING...', 0xffcc00)
  addLog('Scanning 15s...', 0xcccccc)
  teslaBleApi.scan((result) => {
    if (result.type === 'found') {
      foundMAC = result.device.mac || null
      addLog(`FND: ${result.device.name || '?'}`, 0x00cc44)

      // Attempt to auto-extract VIN from Tesla BLE device name.
      // Name format: S<16-hex-chars>C (hex encodes 8 ASCII chars = last 8 VIN chars)
      try {
        var devName = result.device.name || ''
        var m = devName.match(/^S([a-f0-9]{16})C$/i)
        if (m) {
          var hex = m[1]
          var vinPart = ''
          for (var i = 0; i < hex.length; i += 2) {
            vinPart += String.fromCharCode(parseInt(hex.substr(i, 2), 16))
          }
          // Ensure session has storage set; BLE name contains only last 8 VIN chars.

          if (vinPart && vinPart.length > 0) {
            addLog(`VIN suffix detected: ${vinPart}`, 0x44cc44)
          }
        }
      } catch (_e) {
        /* non-fatal */
      }

      teslaBleApi.stopScan()
      state = 'IDLE'
      scheduleTimeout(() => {
        doConnect(foundMAC, 0, doPair)
      }, 500)
    }
    if (result.type === 'complete' && state === 'SCANNING') {
      if (!foundMAC) {
        state = 'IDLE'
        addLog('No device found', 0xff8800)
        updateStatus('IDLE', 0x888888)
      }
    }
  }, 15000)
}
function doConnect(mac, attempt, onConnected) {
  state = 'CONNECTING'
  updateStatus('CONNECTING...', 0xffcc00)
  addLog(`Connecting ${mac.slice(-8)}...`, 0xcccccc)
  teslaBleApi.connect(mac, (result) => {
    if (!result.success) {
      if (attempt < 1) {
        scheduleTimeout(() => {
          doConnect(mac, attempt + 1, onConnected)
        }, 2000)
        return
      }
      state = 'IDLE'
      updateStatus('CONN FAIL', 0xff4444)
      addLog(`Conn err: ${result.error || '?'}`, 0xff4444)
      return
    }
    addLog('✓ Connected', 0x00cc44)
    updateStatus('CONNECTED', 0x00cc44)
    updateChecklist()
    if (onConnected) onConnected()
  })
}
function onConnect() {
  addLog('Connecting...', 0xffcc00)
  updateStatus('CONNECTING...', 0xffcc00)
  teslaSession.requestSessionInfo((result) => {
    if (result.success) {
      updateStatus('SESSION OK', 0x00cc44)
      addLog('✓ Session established', 0x44ff44)
    } else {
      updateStatus('CONN FAIL', 0xff4444)
      addLog(`✗ ${result.error || 'failed'}`, 0xff4444)
    }
    updateChecklist()
  })
}
function onLock() {
  addLog('Locking...', 0xffcc00)
  teslaSession.lock((result) => {
    if (result._requeue) return // Internal requeue - don't show UI feedback yet
    if (result.success) {
      updateStatus('LOCKED', 0x00cc44)
      addLog('✓ Locked', 0x44ff44)
    } else {
      updateStatus('LOCK FAIL', 0xff4444)
      addLog(`✗ ${result.error || 'failed'}`, 0xff4444)
    }
  })
}
function onUnlock() {
  addLog('Unlocking...', 0xffcc00)
  teslaSession.unlock((result) => {
    if (result._requeue) return // Internal requeue - don't show UI feedback yet
    if (result.success) {
      updateStatus('UNLOCKED', 0x00cc44)
      addLog('✓ Unlocked', 0x44ff44)
    } else {
      updateStatus('UNLOCK FAIL', 0xff4444)
      addLog(`✗ ${result.error || 'failed'}`, 0xff4444)
    }
  })
}
function onTestBLE() {
  addLog('BLE self-test...', 0xffcc00)
  updateStatus('TESTING...', 0xffcc00)
  var pass = 0,
    failCount = 0
  function ok(msg) {
    pass++
    addLog(`✓ ${msg}`, 0x44ff44)
  }
  function notOk(msg) {
    failCount++
    addLog(`✗ ${msg}`, 0xff4444)
  }
  function done() {
    updateStatus(
      failCount === 0 ? `PASS ${pass}` : `FAIL ${failCount}/${pass + failCount}`,
      failCount === 0 ? 0x00cc44 : 0xff4444,
    )
  }

  // 1. API methods exist on teslaBLE
  if (typeof teslaBLE.scan === 'function') {
    ok('scan fn')
  } else {
    notOk('scan fn')
  }
  if (typeof teslaBLE.connect === 'function') {
    ok('connect fn')
  } else {
    notOk('connect fn')
  }
  if (typeof teslaBLE.send === 'function') {
    ok('send fn')
  } else {
    notOk('send fn')
  }

  // 2. Single-chunk reassembly: header [0x00,0x03] + payload [0xAA,0xBB,0xCC]
  var rx1 = null
  teslaBLE._lastResponseData = null
  teslaBLE._lastResponseTime = 0
  teslaBLE._rxBuf = null
  teslaBLE._rxExpected = 0
  teslaBLE.responseCallback = (r) => {
    if (r.success) rx1 = r.data
  }
  teslaBLE._handleResponse(new Uint8Array([0x00, 0x03, 0xaa, 0xbb, 0xcc]).buffer)
  if (rx1 && rx1.length === 3 && rx1[0] === 0xaa && rx1[2] === 0xcc) ok('reassembly 1chunk')
  else notOk('reassembly 1chunk')

  // 3. Multi-chunk reassembly: header+[0x01,0x02] then [0x03,0x04]
  var rx2 = null
  teslaBLE._lastResponseData = null
  teslaBLE._lastResponseTime = 0
  teslaBLE._rxBuf = null
  teslaBLE._rxExpected = 0
  teslaBLE.responseCallback = (r) => {
    if (r.success) rx2 = r.data
  }
  teslaBLE._handleResponse(new Uint8Array([0x00, 0x04, 0x01, 0x02]).buffer)
  teslaBLE._handleResponse(new Uint8Array([0x03, 0x04]).buffer)
  if (rx2 && rx2.length === 4 && rx2[0] === 0x01 && rx2[3] === 0x04) ok('reassembly 2chunk')
  else notOk('reassembly 2chunk')

  // 4. Duplicate dedup: same chunk twice within 200ms — only one callback
  var dupCount = 0
  teslaBLE._lastResponseData = null
  teslaBLE._lastResponseTime = 0
  teslaBLE._rxBuf = null
  teslaBLE._rxExpected = 0
  teslaBLE.responseCallback = (r) => {
    if (r.success) dupCount++
  }
  var dupBuf = new Uint8Array([0x00, 0x02, 0xde, 0xad]).buffer
  teslaBLE._handleResponse(dupBuf)
  teslaBLE._handleResponse(dupBuf) // duplicate within 200ms — should be ignored
  if (dupCount === 1) {
    ok('dedup')
  } else {
    notOk(`dedup got=${dupCount}`)
  }
  teslaBLE.responseCallback = null

  // 5. BLE scan 3s — verifies BLE hardware + mstStartScan callable
  addLog('Scanning 3s...', 0x888888)
  var scanCount = 0
  teslaBLE.scan((result) => {
    if (result.type === 'found') {
      scanCount++
      addLog(`DEV:${result.device.name || result.device.mac}`, 0x4488ff)
    }
    if (result.type === 'complete') {
      ok(`scan (${scanCount} devs)`)
      done()
    }
  }, 3000)
}
function onClear() {
  teslaBleApi.clear()
  teslaSession.reset()
  state = 'IDLE'
  foundMAC = null
  updateStatus('CLEARED', 0x888888)
  addLog('Cleared & disconnected', 0x888888)
  updateChecklist()
  store.reset()
}
Page(
  BasePage({
    build() {
      console.log(
        `[BLE-LIFECYCLE] build() called, __blePageInit=${teslaBleApi.__blePageInit}, __pageBuilt=${__pageBuilt}`,
      )

      // Guard against duplicate builds (ZeppOS garbage collection or router issues)
      if (__pageBuilt) {
        console.log('[BLE-LIFECYCLE] Page already built — refreshing checklist and status')
        // Update currentPage reference and refresh checklist so UI reflects any changed store values
        currentPage = this
        try { updateChecklist() } catch (e) { console.log('[BLE] updateChecklist err', e && e.message) }
        return
      }
      __pageBuilt = true

      logWidgets = []
      UI.reset()
      currentPage = this

      // CRITICAL: Clean up any pending operations from main page before initializing BLE here
      console.log('[BLE-LIFECYCLE] Resetting BLE and session from main page interference')
      teslaBleApi.reset()
      teslaSession.reset()

      if (!teslaBleApi.__blePageInit) {
        console.log('[BLE-LIFECYCLE] First initialization - calling teslaBleApi.init()')
        teslaBleApi.init()
        teslaBleApi.__blePageInit = true
      } else {
        console.log('[BLE-LIFECYCLE] Re-entry - skipping teslaBleApi.init()')
      }
      console.log('[BLE-LIFECYCLE] Setting session storage')

      teslaSession.onPoolLow = () => {
        var currentCount = teslaSession.getPoolSize()
        console.log(`[BLE] Pool low (${currentCount}), syncing`)
        currentPage
          .request({ method: 'BLE_SYNC_POOL', params: { currentCount } })
          .then((r) => {
            if (r.success && r.pool) {
              store.keyPool = binaryStringToBytes(r.pool)
              addLog('✓ Pool replenished', 0x44ff44)
            } else {
              addLog('Pool replenish failed', 0xff8844)
            }
            teslaSession.completePoolReplenishment()
          })
          .catch((_e) => {
            addLog('Pool replenish err', 0xff8844)
            teslaSession.completePoolReplenishment()
          })
      }
      // Always request companion for watch key on page open, but avoid noisy logs when unchanged.
      currentPage
        .request({ method: 'BLE_SYNC_KEYS', params: {} })
        .then((result) => {
          try {
            if (result.success && result.publicKeyBinary) {
              // If we don't have a local key, store and log. If we do, only update/log when it changed.
              var existingBytes = store.watchPublicKey
              if (!existingBytes) {
                store.watchPublicKey = result.publicKeyBinary
                addLog('✓ Watch key synced', 0x44ff44)
              } else {
                // Compare by converting existing bytes to binary string
                var existingBin = bytesToBinaryString(existingBytes)
                if (existingBin !== result.publicKeyBinary) {
                  store.watchPublicKey = result.publicKeyBinary
                  addLog('✓ Watch key updated', 0x44ff44)
                }
                // otherwise unchanged — no log
              }
            }
          } catch (e) {
            console.log('[BLE] sync keys compare err', e && e.message)
          }
          updateChecklist()
        })
        .catch(() => {
          updateChecklist()
        })

      var currentCount = teslaSession.getPoolSize()
      currentPage
        .request({ method: 'BLE_SYNC_POOL', params: { currentCount } })
        .then((r) => {
          if (r.success && r.pool) {
            store.keyPool = binaryStringToBytes(r.pool)
            addLog('✓ Pool synced', 0x44ff44)
          }
        })
        .catch(() => {})
      uiText({
        x: 0,
        y: 8,
        w: 480,
        h: 36,
        text: 'BLE CONTROL',
        text_size: 26,
        color: 0xffffff,
        align_h: hmUI.align.CENTER_H,
        centered: false,
      })
      uiRect({ x: 20, y: 44, w: 440, h: 2, color: 0x333333, centered: false })
      statusDotWidget = uiRect({
        x: 22,
        y: 52,
        w: 14,
        h: 14,
        radius: 7,
        color: 0x888888,
        centered: false,
      })
      statusTextWidget = uiText({
        x: 44,
        y: 50,
        w: 416,
        h: 22,
        text: 'IDLE',
        text_size: 20,
        color: 0x888888,
        align_h: hmUI.align.LEFT,
        centered: false,
      })
      uiRect({ x: 20, y: 76, w: 440, h: 1, color: 0x222222, centered: false })
      chkKeyWidget = uiText({
        x: 20,
        y: 80,
        w: 210,
        h: 22,
        text: '? KEY',
        text_size: 18,
        color: 0x888888,
        align_h: hmUI.align.LEFT,
        centered: false,
      })
      chkECWidget = uiText({
        x: 250,
        y: 80,
        w: 210,
        h: 22,
        text: '? EC',
        text_size: 18,
        color: 0x888888,
        align_h: hmUI.align.LEFT,
        centered: false,
      })
      chkTableWidget = uiText({
        x: 20,
        y: 104,
        w: 210,
        h: 22,
        text: '? TABLE',
        text_size: 18,
        color: 0x888888,
        align_h: hmUI.align.LEFT,
        centered: false,
      })
      chkPoolWidget = uiText({
        x: 250,
        y: 104,
        w: 210,
        h: 22,
        text: 'POOL:?',
        text_size: 18,
        color: 0x888888,
        align_h: hmUI.align.LEFT,
        centered: false,
      })
      chkMacWidget = uiText({
        x: 20,
        y: 128,
        w: 440,
        h: 22,
        text: '? MAC',
        text_size: 18,
        color: 0x888888,
        align_h: hmUI.align.LEFT,
        centered: false,
      })
      uiRect({ x: 20, y: 154, w: 440, h: 1, color: 0x222222, centered: false })
      for (var i = 0; i < 6; i++) {
        logWidgets[i] = uiText({
          x: 20,
          y: 158 + i * 26,
          w: 440,
          h: 24,
          text: '',
          text_size: 19,
          color: 0x666666,
          align_h: hmUI.align.LEFT,
          centered: false,
        })
      }
      uiRect({ x: 20, y: 316, w: 440, h: 1, color: 0x333333, centered: false })
      uiButton({
        x: 20,
        y: 322,
        w: 120,
        h: 42,
        text: 'GENKEY',
        text_size: 15,
        color: 0xffffff,
        normal_color: 0x003366,
        press_color: 0x001a33,
        radius: 8,
        click_func: onGenKey,
        centered: false,
      })
      uiButton({
        x: 148,
        y: 322,
        w: 184,
        h: 42,
        text: 'PAIR',
        text_size: 18,
        color: 0xffffff,
        normal_color: 0x1a5c2a,
        press_color: 0x0d2d15,
        radius: 8,
        click_func: onPair,
        centered: false,
      })
      uiButton({
        x: 340,
        y: 322,
        w: 120,
        h: 42,
        text: 'CLEAR',
        text_size: 15,
        color: 0xffffff,
        normal_color: 0x5c1a1a,
        press_color: 0x2d0d0d,
        radius: 8,
        click_func: onClear,
        centered: false,
      })
      uiButton({
        x: 20,
        y: 370,
        w: 120,
        h: 42,
        text: 'CONNECT',
        text_size: 14,
        color: 0xffffff,
        normal_color: 0x1a3a5c,
        press_color: 0x0d1f2d,
        radius: 8,
        click_func: onConnect,
        centered: false,
      })
      uiButton({
        x: 148,
        y: 370,
        w: 88,
        h: 42,
        text: 'LOCK',
        text_size: 16,
        color: 0xffffff,
        normal_color: 0x5c3a00,
        press_color: 0x2d1d00,
        radius: 8,
        click_func: onLock,
        centered: false,
      })
      uiButton({
        x: 244,
        y: 370,
        w: 216,
        h: 42,
        text: 'UNLOCK',
        text_size: 16,
        color: 0xffffff,
        normal_color: 0x1a5c2a,
        press_color: 0x0d2d15,
        radius: 8,
        click_func: onUnlock,
        centered: false,
      })
      uiButton({
        x: 20,
        y: 418,
        w: 440,
        h: 42,
        text: 'TEST BLE',
        text_size: 16,
        color: 0xffffff,
        normal_color: 0x2a2a66,
        press_color: 0x15153a,
        radius: 8,
        click_func: onTestBLE,
        centered: false,
      })
      teslaBleApi.onDisconnect = () => {
        if (state === 'WAITING_KEYCARD' || state === 'PAIRING') {
          state = 'IDLE'
          updateStatus('DISCONNECTED', 0xff4444)
          addLog('BLE dropped', 0xff8800)
        }
      }
      updateStatus('IDLE', 0x888888)
      addLog('BLE control ready', 0xcccccc)
      keepScreenOn(true, 600000)
    },
    onDestroy() {
      console.log(`[BLE-LIFECYCLE] onDestroy() called, __blePageInit=${teslaBleApi.__blePageInit}`)
      __pageBuilt = false // Allow rebuild when page is re-created
      keepScreenOn(false)
      console.log('[BLE-LIFECYCLE] Calling teslaBleApi.reset()')
      teslaBleApi.reset()
      teslaBleApi.onDisconnect = null
      console.log('[BLE-LIFECYCLE] Calling teslaSession.reset()')
      teslaSession.reset()
      console.log('[BLE-LIFECYCLE] Clearing timers')
      clearAllTimers()
      state = 'IDLE'
      foundMAC = null
      logLines = ['', '', '', '', '', '']
      logColors = [0x666666, 0x666666, 0x666666, 0x666666, 0x666666, 0x666666]
      logWidgets = []
      statusDotWidget = null
      statusTextWidget = null
      chkKeyWidget = null
      chkECWidget = null
      chkTableWidget = null
      chkPoolWidget = null
      chkMacWidget = null
    },
    onHide() {
      console.log('[BLE-LIFECYCLE] onHide() called')
      keepScreenOn(false)
    },
  }),
)
