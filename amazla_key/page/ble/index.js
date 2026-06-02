import * as hmUI from '@zos/ui'
import UI, { button as uiButton, rect as uiRect, text as uiText } from '../../../pages/ui.js'
import { keepScreenOn } from '../../../zeppify/index.js'
import store from '../../lib/store.js'
import BLE from '../../lib/tesla-ble/index.js'
import { createPairingController } from '../../lib/tesla-ble/pairing.js'
import teslaSession from '../../lib/tesla-ble/session.js'
import Phone from '../../lib/phone.js'

// Store initialization flag on the imported module (survives re-evaluation)
if (BLE.__blePageInit === undefined) {
  BLE.__blePageInit = false
}

var state = 'IDLE'
var pairingCtrl = null
var logLines = ['', '', '', '', '', '']
var logColors = [0x666666, 0x666666, 0x666666, 0x666666, 0x666666, 0x666666]
var phone = null
var activeTimers = []
var __pageBuilt = false // Prevent duplicate builds
var statusDotWidget = null
var statusTextWidget = null
var chkKeyWidget = null
var chkPrivWidget = null
var chkECWidget = null
var chkTableWidget = null
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
function clearAllTimers() {
  for (var i = 0; i < activeTimers.length; i++) {
    clearTimeout(activeTimers[i])
  }
  activeTimers = []
}
function updateChecklist() {
  var watchKey = store.watchPublicKey
  var watchPriv = store.watchPrivateKey
  var ecKey = store.vehicleEcPublicKey
  var hasTable = store.hasDoublingsTable
  var mac = store.vehicleMac
  var vehicleName = store.vehicleName
  var vehicleVinBytes = store.vehicleVin
  var vehicleVin = vehicleVinBytes ? String.fromCharCode.apply(null, vehicleVinBytes) : null
  if (chkKeyWidget)
    chkKeyWidget.setProperty(hmUI.prop.TEXT, `${watchKey ? '✓' : '✗'} KEY:${watchKey ? watchKey.length : '---'}b`)
  if (chkPrivWidget)
    chkPrivWidget.setProperty(hmUI.prop.TEXT, `${watchPriv ? '✓' : '✗'} PRIV:${watchPriv ? watchPriv.length : '---'}b`)
  if (chkECWidget) chkECWidget.setProperty(hmUI.prop.TEXT, `${ecKey ? '✓' : '✗'} EC:${ecKey ? ecKey.length : '---'}b`)
  if (chkTableWidget) chkTableWidget.setProperty(hmUI.prop.TEXT, `${hasTable ? '✓' : '✗'} TABLE`)
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
  if (chkPrivWidget) chkPrivWidget.setProperty(hmUI.prop.COLOR, watchPriv ? 0x44cc66 : 0xff5555)
  if (chkECWidget) chkECWidget.setProperty(hmUI.prop.COLOR, ecKey ? 0x44cc66 : 0xff5555)
  if (chkTableWidget) chkTableWidget.setProperty(hmUI.prop.COLOR, hasTable ? 0x44cc66 : 0xff5555)
}
const STATE_COLORS = {
  setup: 0xffcc00, scanning: 0xffcc00, connecting: 0xffcc00,
  pairing: 0xffcc00, confirming: 0xff4444, verifying: 0xffcc00, done: 0x00cc44,
}
const STATE_LABELS = {
  setup: 'SETUP...', scanning: 'SCANNING...', connecting: 'CONNECTING...',
  pairing: 'PAIRING...', confirming: 'TAP KEY CARD', verifying: 'VERIFYING...', done: 'PAIRED!',
}
function onPair() {
  if (state === 'scanning' || state === 'connecting' || state === 'pairing' || state === 'confirming') {
    addLog('Busy: ' + state, 0xff8800)
    return
  }
  if (pairingCtrl) { pairingCtrl.cancel(); pairingCtrl = null }
  pairingCtrl = createPairingController(phone, {
    onState(s) {
      state = s
      updateStatus(STATE_LABELS[s] || s.toUpperCase(), STATE_COLORS[s] || 0x888888)
      if (s === 'confirming') addLog('TAP KEY CARD on console!', 0xff4444)
    },
    onLog(msg) { addLog(msg, 0x888888) },
    onSuccess() {
      addLog('✓ Paired!', 0x44ff44)
      updateChecklist()
      pairingCtrl = null
      var mac = store.vehicleMac
      if (mac) {
        phone.saveVehicleMac(mac, (r) => {
          if (r.success) addLog('✓ MAC saved', 0x44ff44)
          else addLog('MAC save failed', 0xff8800)
        })
      }
    },
    onError(msg) {
      state = 'IDLE'
      updateStatus('ERROR', 0xff4444)
      addLog(msg, 0xff4444)
      pairingCtrl = null
    },
  })
  pairingCtrl.start()
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
function onClear() {
  BLE.clear()
  teslaSession.reset()
  state = 'IDLE'
  updateStatus('CLEARED', 0x888888)
  addLog('Cleared & disconnected', 0x888888)
  updateChecklist()
  store.reset()
}
Page({
    build() {
      console.log(
        `[BLE-LIFECYCLE] build() called, __blePageInit=${BLE.__blePageInit}, __pageBuilt=${__pageBuilt}`,
      )

      // Guard against duplicate builds (ZeppOS garbage collection or router issues)
      if (__pageBuilt) {
        console.log('[BLE-LIFECYCLE] Page already built — refreshing checklist and status')
        phone = new Phone()
        try { updateChecklist() } catch (e) { console.log('[BLE] updateChecklist err', e && e.message) }
        return
      }
      __pageBuilt = true

      console.log('[STORE.diag] === on BLE page build (second-run state) ===')
      try { store.diag() } catch (e) { console.log('[STORE.diag] err', e && e.message) }

      logWidgets = []
      UI.reset()
      phone = new Phone()

      BLE.reset()
      teslaSession.reset()

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
        w: 140,
        h: 22,
        text: '? KEY',
        text_size: 18,
        color: 0x888888,
        align_h: hmUI.align.LEFT,
        centered: false,
      })
      chkPrivWidget = uiText({
        x: 170,
        y: 80,
        w: 140,
        h: 22,
        text: '? PRIV',
        text_size: 18,
        color: 0x888888,
        align_h: hmUI.align.LEFT,
        centered: false,
      })
      chkECWidget = uiText({
        x: 320,
        y: 80,
        w: 140,
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
      BLE.onDisconnect = () => {
        if (state === 'WAITING_KEYCARD' || state === 'PAIRING') {
          state = 'IDLE'
          updateStatus('DISCONNECTED', 0xff4444)
          addLog('BLE dropped', 0xff8800)
        }
      }
      // Render from locally-persisted state — keys, table, EC key and VIN all
      // live in LocalStorage / files and need no phone. After pairing the watch
      // is fully standalone; keys are written by PAIR (pairSetup), never synced
      // on page open, so the checklist must reflect local state with no phone.
      updateChecklist()
      updateStatus(store.isPaired ? 'READY' : 'NOT PAIRED', store.isPaired ? 0x00cc44 : 0x888888)
      addLog('BLE control ready', 0xcccccc)
      keepScreenOn(true, 600000)
    },
    onDestroy() {
      console.log(`[BLE-LIFECYCLE] onDestroy() called, __blePageInit=${BLE.__blePageInit}`)
      __pageBuilt = false // Allow rebuild when page is re-created
      keepScreenOn(false)
      console.log('[BLE-LIFECYCLE] Calling BLE.reset()')
      BLE.reset()
      BLE.onDisconnect = null
      console.log('[BLE-LIFECYCLE] Calling teslaSession.reset()')
      teslaSession.reset()
      console.log('[BLE-LIFECYCLE] Clearing timers')
      clearAllTimers()
      state = 'IDLE'

      logLines = ['', '', '', '', '', '']
      logColors = [0x666666, 0x666666, 0x666666, 0x666666, 0x666666, 0x666666]
      logWidgets = []
      statusDotWidget = null
      statusTextWidget = null
      chkKeyWidget = null
      chkPrivWidget = null
      chkECWidget = null
      chkTableWidget = null
      chkMacWidget = null
    },
    onHide() {
      console.log('[BLE-LIFECYCLE] onHide() called')
      keepScreenOn(false)
    },
})
