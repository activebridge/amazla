import * as hmUI from '@zos/ui'
import { BasePage } from '@zeppos/zml/base-page'
import { keepScreenOn } from '../../../zeppify/index.js'
import teslaBleApi from '../../lib/tesla-ble/index.js'
import teslaSession from '../../lib/tesla-ble/session.js'
import { ecdh, _setProfile, _setWNAFWidth } from '../../lib/tesla-ble/crypto/p256.js'
import { sha1 } from '../../lib/tesla-ble/crypto/sha256.js'
import { writeFileSync, readFileSync } from '@zos/fs'

// Shared storage with BLE page (same ble_settings.txt, same MAC)
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

// ── state ─────────────────────────────────────────────────────────────────────
// IDLE → CONNECTING → SESSION (ECDH running) → READY → UNLOCKING/LOCKING
var state = 'IDLE'
var lastCmdMs = 0
var logLines  = ['', '', '', '', '', '', '', '']
var logColors = [0x666666, 0x666666, 0x666666, 0x666666, 0x666666, 0x666666, 0x666666, 0x666666]

var statusDotWidget  = null
var statusTextWidget = null
var deviceInfoWidget = null
var logWidgets       = []
var currentPage      = null

// ── helpers ───────────────────────────────────────────────────────────────────
function addLog(msg, color) {
  console.log('[Log]', msg)  // Also log to console
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
  var s       = teslaBleApi.getStatus()
  var savePart = (s.savedMAC && s.savedMAC.length >= 8) ? s.savedMAC.slice(-8) : '--------'
  var poolSize = teslaSession.getPoolSize()
  var lastStr  = lastCmdMs > 0 ? lastCmdMs + 'ms' : '---'
  if (deviceInfoWidget) deviceInfoWidget.setProperty(hmUI.prop.TEXT,
    'MAC:' + savePart + ' POOL:' + poolSize + '  LAST:' + lastStr)
}

function dumpHex(bytes, n) {
  if (!bytes) return 'null'
  var s = ''
  var limit = Math.min(bytes.length, n || 8)
  for (var i = 0; i < limit; i++) s += ('0' + bytes[i].toString(16)).slice(-2)
  if (bytes.length > limit) s += '..'
  return s
}

function hexToBytes(hex) {
  var b = new Uint8Array(hex.length / 2)
  for (var i = 0; i < hex.length; i += 2) b[i / 2] = parseInt(hex.substr(i, 2), 16)
  return b
}

// ── perf test ─────────────────────────────────────────────────────────────────
// Test vectors from __tests__/crypto-p256.test.js (ALICE_PRIV × BOB_PUB)
var PERF_PRIV = hexToBytes('c9afa9d845ba75166b5c215767b1d6934e50c3db36e89b127b8a622b120f6721')
var PERF_PUB  = hexToBytes(
  '047cf27b188d034f7e8a52380304b51ac3c08969e277f21b35a60b48fc47669978' +
  '07775510db8ed040293d9ac69f7430dbba7dade63ce982299e04b79d227873d1'
)

function onPerfTest() {
  onPerfTestWithWidth(4) // Default: wNAF-4
}

function onPerfTest5() {
  onPerfTestWithWidth(5) // Test: wNAF-5
}

function onPerfTestWithWidth(width) {
  var N = 1  // Simulate single session establishment
  addLog('PERF: Profiling ECDH...', 0xffcc00)
  updateStatus('PERF TEST...', 0xffcc00)

  // Defer so the log message renders before the blocking scalar-mul
  setTimeout(function() {
    console.log('[PERF] Starting detailed profiling...')
    
    _setWNAFWidth(width)
    console.log('[PERF] Using wNAF-' + width + ' encoding')
    
    // Setup profiling
    var profile = {}
    _setProfile(profile)
    
    var t0 = Date.now()
    
    // Time the ECDH call
    var shared = ecdh(PERF_PRIV, PERF_PUB)
    
    // Time SHA1
    var sessionKey = sha1(shared).slice(0, 16)
    var t3 = Date.now()
    
    var elapsed = t3 - t0
    
    console.log('[PERF] Total:', elapsed + 'ms')
    console.log('[PERF] ECDH:', profile.scalarMul_ms + 'ms')
    console.log('[PERF] modInv calls:', profile.modInv_calls + ', time:', profile.modInv_ms + 'ms')
    console.log('[PERF] jacDbl calls:', profile.jacDbl_calls)
    
    // Granular jacDbl breakdown
    if (profile.dbl_sqr_A_ms || profile.dbl_mul_B_ms) {
      console.log('[PERF] jacDbl breakdown (per call avg):')
      console.log('[PERF]   sqr(A):', (profile.dbl_sqr_A_ms / profile.jacDbl_calls).toFixed(2) + 'ms')
      console.log('[PERF]   mul(B):', (profile.dbl_mul_B_ms / profile.jacDbl_calls).toFixed(2) + 'ms')
      console.log('[PERF]   sqr(C):', (profile.dbl_sqr_C_ms / profile.jacDbl_calls).toFixed(2) + 'ms')
      console.log('[PERF]   mul(D):', (profile.dbl_mul_D_ms / profile.jacDbl_calls).toFixed(2) + 'ms')
      console.log('[PERF]   final:', (profile.dbl_final_ms / profile.jacDbl_calls).toFixed(2) + 'ms')
      var dbl_total = (profile.dbl_sqr_A_ms || 0) + (profile.dbl_mul_B_ms || 0) + (profile.dbl_sqr_C_ms || 0) + (profile.dbl_mul_D_ms || 0) + (profile.dbl_final_ms || 0)
      console.log('[PERF]   jacDbl total:', dbl_total + 'ms')
    }
    
    console.log('[PERF] jacAdd calls:', profile.jacAdd_calls)
    if (profile.add_setup_ms || profile.add_compute_ms) {
      console.log('[PERF] jacAdd breakdown (per call avg):')
      console.log('[PERF]   setup:', (profile.add_setup_ms / profile.jacAdd_calls).toFixed(2) + 'ms')
      console.log('[PERF]   compute:', (profile.add_compute_ms / profile.jacAdd_calls).toFixed(2) + 'ms')
      var add_total = (profile.add_setup_ms || 0) + (profile.add_compute_ms || 0)
      console.log('[PERF]   jacAdd total:', add_total + 'ms')
    }
    console.log('[PERF] Result:', dumpHex(shared, 16))
    
    addLog('Total: ' + elapsed + 'ms', 0x00cc44)
    addLog('ECDH:  ' + ecdhTime + 'ms', 0x666666)
    addLog('SHA1:  ' + sha1Time + 'ms', 0x666666)
    addLog('~30/sec = passive unlock', 0x4488ff)
    updateStatus('PERF DONE', 0x00cc44)
  }, 50)
}

// ── key pool generation ───────────────────────────────────────────────────────
function requestKeyPool() {
  var oldSize = teslaSession.getPoolSize()
  addLog('Current pool: ' + oldSize + ' keys', 0x666666)
  addLog('Generating 5 more...', 0xffcc00)
  currentPage.request({ method: 'BLE_GENERATE_SESSION_KEYS', params: { count: 5 } })
    .then(function(response) {
      console.log('[KeyPool] Response:', JSON.stringify(response))
      
      // Handle nested result object: response.result contains the actual data
      var result = response && response.result ? response.result : response
      
      if (result && result.success && result.pool) {
        // Store base64 binary directly in LocalStorage (session.js reads from there)
        var s = teslaSession.storage
        console.log('[KeyPool] Storage type:', typeof s, 'has setItem:', typeof s.setItem)
        s.setItem('key_pool', result.pool)
        console.log('[KeyPool] Stored to key_pool, length:', result.pool.length)
        
        // Verify it was saved
        var readBack = s.getItem('key_pool')
        console.log('[KeyPool] Read back length:', readBack ? readBack.length : 'null')
        
        var count = teslaSession.getPoolSize()
        addLog('✓ Pool: ' + count + ' keys ready', 0x00cc44)
        console.log('[KeyPool] Final count:', count)
        updateDeviceInfo()
      } else {
        addLog('Pool gen failed', 0xff4444)
        addLog('Result: ' + JSON.stringify(result || {}), 0xff8800)
        console.log('[KeyPool] Failed - result:', JSON.stringify(result))
      }
    })
    .catch(function(e) {
      addLog('Pool err: ' + (e && e.message || '?'), 0xff4444)
      addLog('Make sure phone app is open', 0xff8800)
      console.log('[KeyPool] Error:', e)
    })
}

// ── connect + session flow ────────────────────────────────────────────────────
function onConnect() {
  if (state === 'CONNECTING' || state === 'SESSION') {
    addLog('Busy: ' + state, 0xff8800)
    return
  }

  // Check pool before connecting
  var poolSize = teslaSession.getPoolSize()
  if (poolSize === 0) {
    addLog('Pool empty!', 0xff4444)
    requestKeyPool()
    return
  }

  if (teslaBleApi.isConnected() && state === 'READY') {
    addLog('Already ready', 0xcccccc)
    return
  }

  var mac = storage.getItem('tesla_ble_mac')
  if (!mac) {
    addLog('No saved MAC', 0xff4444)
    addLog('Pair first via BLE page', 0xff8800)
    return
  }

  state = 'CONNECTING'
  updateStatus('CONNECTING...', 0xffcc00)
  addLog('Connecting...', 0xcccccc)
  addLog(mac.slice(-17), 0xaaaaaa)

  // Reset any previous session
  teslaSession.reset()

  setTimeout(function() { doConnect(mac, 0) }, 1500)
}

function doConnect(mac, attempt) {
  addLog('BLE: connect attempt ' + (attempt + 1), 0x666666)
  teslaBleApi.connect(mac, function(result) {
    if (!result.success) {
      var errMsg = result.error || 'unknown'
      addLog('BLE: conn failed - ' + errMsg, 0xff4444)
      if (attempt < 1) {
        addLog('BLE: retrying...', 0xff8800)
        setTimeout(function() { doConnect(mac, attempt + 1) }, 2000)
        return
      }
      state = 'IDLE'
      updateStatus('CONN FAIL', 0xff4444)
      addLog('BLE: gave up after 2 attempts', 0xff4444)
      return
    }

    addLog('BLE: connected to ' + mac.slice(-5), 0x00cc44)
    state = 'SESSION'
    updateStatus('ECDH...', 0x4488ff)
    addLog('CRYPTO: starting session...', 0xcccccc)
    addLog('CRYPTO: ECDH ~8s', 0x666666)

    var t0 = Date.now()
    teslaSession.requestSessionInfo(function(r) {
      var ms = Date.now() - t0
      if (!r.success) {
        state = 'IDLE'
        updateStatus('SESSION FAIL', 0xff4444)
        var sessErr = r.error || 'unknown'
        addLog('CRYPTO: session failed - ' + sessErr, 0xff4444)
        if (sessErr.indexOf('HMAC') >= 0) {
          addLog('ERR: Invalid session key', 0xff6666)
        } else if (sessErr.indexOf('timeout') >= 0) {
          addLog('ERR: BLE timeout', 0xff6666)
        }
        return
      }
      state = 'READY'
      updateStatus('READY', 0x00cc44)
      addLog('CRYPTO: session OK ' + ms + 'ms', 0x00cc44)
      addLog('CRYPTO: counter=' + r.counter + ' epoch=' + r.epoch.slice(0, 8), 0x666666)
      updateDeviceInfo()
    })
  }, storage)
}

// ── command handlers ──────────────────────────────────────────────────────────
function onUnlock() {
  if (state !== 'READY') {
    addLog('CMD: not ready (' + state + ')', 0xff8800)
    return
  }
  state = 'UNLOCKING'
  updateStatus('UNLOCKING...', 0xff8800)
  addLog('CMD: unlock starting...', 0xcccccc)
  var t0 = Date.now()
  teslaSession.unlock(function(result) {
    lastCmdMs = Date.now() - t0
    state = 'READY'
    if (!result.success) {
      updateStatus('READY', 0x00cc44)
      var unlErr = result.error || 'unknown'
      addLog('CMD: unlock failed - ' + unlErr, 0xff4444)
      if (unlErr.indexOf('counter') >= 0) {
        addLog('ERR: counter mismatch', 0xff6666)
      } else if (unlErr.indexOf('HMAC') >= 0) {
        addLog('ERR: authentication failed', 0xff6666)
      }
    } else {
      updateStatus('UNLOCKED', 0x00cc44)
      addLog('CMD: unlock OK ' + lastCmdMs + 'ms', 0x00cc44)
    }
    updateDeviceInfo()
  })
}

function onLock() {
  if (state !== 'READY') {
    addLog('CMD: not ready (' + state + ')', 0xff8800)
    return
  }
  state = 'LOCKING'
  updateStatus('LOCKING...', 0xff8800)
  addLog('CMD: lock starting...', 0xcccccc)
  var t0 = Date.now()
  teslaSession.lock(function(result) {
    lastCmdMs = Date.now() - t0
    state = 'READY'
    if (!result.success) {
      updateStatus('READY', 0x00cc44)
      var lockErr = result.error || 'unknown'
      addLog('CMD: lock failed - ' + lockErr, 0xff4444)
    } else {
      updateStatus('LOCKED', 0x44aaff)
      addLog('CMD: lock OK ' + lastCmdMs + 'ms', 0x44aaff)
    }
    updateDeviceInfo()
  })
}

// ── page ──────────────────────────────────────────────────────────────────────
Page(BasePage({
  build() {
    currentPage = this
    storage.load()
    teslaBleApi.init(storage)
    
    // Set teslaSession to use the same file-based storage
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

    // CONNECT button
    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 35, y: 350, w: 120, h: 50,
      text: 'CONNECT', text_size: 18, color: 0xffffff,
      normal_color: 0x1a3a5c, press_color: 0x0d1f2d, radius: 12,
      click_func: onConnect,
    })

    // UNLOCK button
    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 180, y: 350, w: 120, h: 50,
      text: 'UNLOCK', text_size: 20, color: 0xffffff,
      normal_color: 0x1a5c2a, press_color: 0x0d2d15, radius: 12,
      click_func: onUnlock,
    })

    // LOCK button
    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 325, y: 350, w: 120, h: 50,
      text: 'LOCK', text_size: 20, color: 0xffffff,
      normal_color: 0x5c3a00, press_color: 0x2d1d00, radius: 12,
      click_func: onLock,
    })

    // Hidden debug buttons (temporary, can be removed)
    // PERF TEST button (commented out for production)
    // hmUI.createWidget(hmUI.widget.BUTTON, {
    //   x: 35, y: 410, w: 200, h: 50,
    //   text: 'PERF TEST', text_size: 20, color: 0xffffff,
    //   normal_color: 0x3a2060, press_color: 0x1a0e30, radius: 12,
    //   click_func: onPerfTest,
    // })

    // GENERATE POOL button (keep for debugging key pool issues)
    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 35, y: 410, w: 410, h: 50,
      text: 'GEN POOL (DEBUG)', text_size: 18, color: 0xffffff,
      normal_color: 0x006080, press_color: 0x003040, radius: 12,
      click_func: requestKeyPool,
    })

    teslaBleApi.onDisconnect = function() {
      state = 'IDLE'
      teslaSession.reset()
      updateStatus('DISCONNECTED', 0xff4444)
      addLog('Disconnected', 0xff4444)
    }

    updateDeviceInfo()

    // Auto-generate key pool if empty
    var poolSize = teslaSession.getPoolSize()
    if (poolSize === 0) {
      addLog('Pool empty - generating...', 0xffcc00)
      requestKeyPool()
    } else {
      addLog('Pool: ' + poolSize + ' keys ready', 0x00cc44)
      // Auto-connect to Tesla when page opens
      addLog('Auto-connecting...', 0x666666)
      setTimeout(function() {
        onConnect()
      }, 500)
    }

    keepScreenOn(true, 600000)
  },

  onDestroy() {
    keepScreenOn(false)
    teslaBleApi.disconnect()
    teslaSession.reset()
  },

  onHide() {
    keepScreenOn(false)
    teslaBleApi.disconnect()
    teslaSession.reset()
  }
}))
