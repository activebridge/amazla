import * as hmUI from '@zos/ui'
import { setWakeUpRelaunch, setPageBrightTime } from '@zos/display'
import { getDeviceInfo } from '@zos/device'
import { onKey, KEY_SELECT, KEY_EVENT_CLICK } from '@zos/interaction'
import { push } from '@zos/router'
import { BasePage } from '@zeppos/zml/base-page'
import { keepScreenOn } from '../../zeppify/index.js'
import store from '../lib/store.js'
import { binaryStringToBytes } from '../lib/tesla-ble/crypto/binary-utils.js'

import UI, { page, button, img, rect } from '../../pages/ui'
import { LOCK, UNLOCK, CLOSE, OPEN } from '../../pages/styles'
import vibrate from '../../pages/vibrate'
import { buildClosureMoveRequest } from '../lib/tesla-ble/protocol/vcsec.js'
import teslaSession from '../lib/tesla-ble/session.js'

const { height } = getDeviceInfo()


var vehicleState = {
  locked: true,
  df: false, dr: false, pf: false, pr: false,
  trunkOpen: false, frunkOpen: false,
}

var connectionState = {
  status: 'checking', // 'checking' | 'online' | 'offline' | 'error'
  error: null,
}

var isRunning = false
var currentPage = null

const render = () => {
  const { locked, df, dr, pf, pr, trunkOpen, frunkOpen } = vehicleState

  UI.reset()
  const slide1 = page(0, 0)

  // Always show car state
  locked  && img({ w: 352, h: 460, src: 'Y_Top_View_Dark.png' }, slide1)
  !locked && img({ w: 352, h: 460, src: 'Y_Top_View.png' },      slide1)
  frunkOpen && img({ w: 352, h: 460, src: 'Y_Frunk.png' },           slide1)
  trunkOpen && img({ w: 352, h: 460, src: 'Y_Trunk.png' },           slide1)
  pf && img({ w: 352, h: 460, src: 'Y_Right_Front_Door.png' }, slide1)
  pr && img({ w: 352, h: 460, src: 'Y_Right_Back_Door.png' },  slide1)
  df && img({ w: 352, h: 460, src: 'Y_Left_Front_Door.png' },  slide1)
  dr && img({ w: 352, h: 460, src: 'Y_Left_Back_Door.png' },   slide1)

  // If offline, show overlay with error and help
  if (connectionState.status !== 'online') {
    rect({ w: 352, h: 460, color: 0x000000, alpha: 0.6 }, slide1)
    
    const statusText = connectionState.status === 'checking' ? 'Connecting...' : 'Connection Failed'
    button({
      centered: true, x: 0, y: 80,
      w: 340, h: 60,
      text: statusText, text_size: 18, color: 0xcccccc,
      normal_color: 0x222222, press_color: 0x333333, radius: 8,
    }, slide1)
    
    if (connectionState.error) {
      button({
        centered: true, x: 0, y: 160,
        w: 340, h: 50,
        text: connectionState.error.substring(0, 30), text_size: 12, color: 0xffaaaa,
        normal_color: 0x220000, press_color: 0x330000, radius: 6,
      }, slide1)
    }
    
    // Retry button
    button({
      centered: true, x: 0, y: 240,
      w: 280, h: 50,
      text: 'Retry', text_size: 16, color: 0xffff99,
      normal_color: 0x333300, press_color: 0x444400, radius: 6,
      click_func: onRetryConnection,
    }, slide1)
    
    // Go to BLE page button
    button({
      centered: true, x: 0, y: 310,
      w: 280, h: 50,
      text: 'BLE Setup', text_size: 16, color: 0x99ccff,
      normal_color: 0x003366, press_color: 0x004488, radius: 6,
      click_func: onGoToBLE,
    }, slide1)

    button({
      centered: true, x: 0, y: 375,
      w: 280, h: 50,
      text: 'Simulate Pair', text_size: 16, color: 0x99ffcc,
      normal_color: 0x003322, press_color: 0x004433, radius: 6,
      click_func: onSimulatePair,
    }, slide1)

    return
  }

  // When online, show full controls
  frunkOpen  && button({ ...CLOSE, y: -150, w: 200, h: 160, click_func: onFrunk }, slide1)
  !frunkOpen && button({ ...OPEN,  y: -160, w: 200, h: 160, click_func: onFrunk }, slide1)
  trunkOpen  && button({ ...CLOSE, y: 160,  w: 200, h: 160, click_func: onTrunk }, slide1)
  !trunkOpen && button({ ...OPEN,  y: 150,  w: 200, h: 160, click_func: onTrunk }, slide1)
  locked  && button({ ...LOCK,   w: 100, h: 110, click_func: onUnlock }, slide1)
  !locked && button({ ...UNLOCK, w: 100, h: 110, click_func: onLock   }, slide1)

  rect({ w: 40, h: 20, y: height / 2 - 18, color: 0x000000 }, slide1)

  button({
    centered: false,
    x: 108, y: 217, w: 72, h: 36,
    text: 'BLE', text_size: 13, color: 0x555555,
    normal_color: 0x111111, press_color: 0x222222, radius: 6,
    click_func: function() { push({ url: 'page/ble/index' }) },
  }, slide1)
}

const applyStatus = (status) => {
  const cs = status.closureStatuses || {}
  vehicleState = {
    locked:    status.vehicleLockState === 1,
    df:        cs.frontDriverDoor    === 1,
    dr:        cs.rearDriverDoor     === 1,
    pf:        cs.frontPassengerDoor === 1,
    pr:        cs.rearPassengerDoor  === 1,
    trunkOpen: cs.rearTrunk          === 1,
    frunkOpen: cs.frontTrunk         === 1,
  }
}

const refreshStatus = () => {
  hmUI.updateStatusBarTitle('Syncing…')
  teslaSession.getVehicleStatus(function(result) {
    if (result.success) {
      connectionState.status = 'online'
      connectionState.error = null
      applyStatus(result.status)
      hmUI.updateStatusBarTitle('Online')
      render()
    } else {
      connectionState.status = 'offline'
      connectionState.error = result.error
      hmUI.updateStatusBarTitle('⚠ Offline: ' + (result.error || 'Not connected'))
      console.log('[INDEX] getVehicleStatus failed:', result.error)
      render()
    }
  })
}

// Manual retry button
const onRetryConnection = () => {
  console.log('[INDEX] User triggered manual retry')
  connectionState.status = 'checking'
  render()
  setTimeout(() => refreshStatus(), 100)
}

// Help: go to BLE page to fix connection
const onGoToBLE = () => {
  console.log('[INDEX] User navigating to BLE page for connection help')
  push({ url: 'page/ble/index' })
}

const sendCommand = (rkeAction, label) => {
  if (isRunning) { hmUI.showToast({ text: 'Busy…' }); return }
  isRunning = true
  hmUI.updateStatusBarTitle(label + '…')
  teslaSession.sendRKECommand(rkeAction, function(result) {
    isRunning = false
    if (result.success) {
      vibrate(24)
      hmUI.updateStatusBarTitle('✓ ' + label)
      setTimeout(refreshStatus, 1000)
    } else {
      hmUI.updateStatusBarTitle('✗ Error')
      hmUI.showToast({ text: result.error || 'Error' })
    }
  })
}

const sendClosure = (closureId, moveType, label) => {
  if (isRunning) { hmUI.showToast({ text: 'Busy…' }); return }
  isRunning = true
  hmUI.updateStatusBarTitle(label + '…')
  teslaSession.ensureSessionEstablished(function(result) {
    if (!result.success) {
      isRunning = false
      hmUI.updateStatusBarTitle('✗ Error')
      hmUI.showToast({ text: result.error || 'Error' })
      return
    }
    // Build closureMoveRequest payload and send via authenticated command
    try {
      const cmr = buildClosureMoveRequest(closureId, moveType)
      teslaSession.sendCommand({ closureMoveRequest: cmr }, function(result) {
        isRunning = false
        if (result && result._requeue) {
          // Intermediate ack — session handler re-queued the callback; wait for final response
          return
        }
        if (!result.success) {
          hmUI.updateStatusBarTitle('✗ Error')
          hmUI.showToast({ text: result.error || 'Error' })
          return
        }
        const resp = result.response
        if (resp && resp.actionStatus) {
          vibrate(24)
          hmUI.updateStatusBarTitle('✓ ' + label)
          setTimeout(refreshStatus, 1000)
        } else {
          hmUI.updateStatusBarTitle('✗ Error')
          hmUI.showToast({ text: 'No action status' })
        }
      })
    } catch (e) {
      isRunning = false
      hmUI.updateStatusBarTitle('✗ Error')
      hmUI.showToast({ text: e.message || 'Error' })
    }
  })
}

const onSimulatePair = () => {
  hmUI.updateStatusBarTitle('Simulating pair...')
  var vehicleEcKeyBinary = null
  currentPage.request({ method: 'SIMULATE_PAIR', params: {} })
    .then(function(r) {
      if (!r.success) {
        hmUI.showToast({ text: r.error || 'Simulate failed' })
        hmUI.updateStatusBarTitle('Sim pair failed')
        throw new Error('handled')
      }
      // Store watch public key as binary string (no conversion)
      store.watchPublicKey     = r.watchPublicKeyBinary
      store.vehicleEcPublicKey = binaryStringToBytes(r.vehicleEcKeyBinary)
      store.vehicleMac         = r.mac
      store.vehicleVin         = r.vin
      vehicleEcKeyBinary       = r.vehicleEcKeyBinary
      hmUI.updateStatusBarTitle('Computing table...')
      return currentPage.request({ method: 'BLE_PRECOMPUTE_TABLE', params: { vehiclePublicKeyBinary: vehicleEcKeyBinary } })
    })
    .then(function(r) {
      if (!r.success || !r.table) {
        hmUI.showToast({ text: 'Table failed: ' + (r.error || '?') })
        hmUI.updateStatusBarTitle('Sim pair failed')
        throw new Error('handled')
      }
      store.vehicleDoublingsTable = binaryStringToBytes(r.table)
      hmUI.updateStatusBarTitle('Generating keys...')
      return currentPage.request({ method: 'BLE_GENERATE_SESSION_KEYS', params: { count: 20 } })
    })
    .then(function(r) {
      if (r && r.success && r.pool) {
        store.keyPool = binaryStringToBytes(r.pool)
      }
      hmUI.showToast({ text: 'Simulate pair OK' })
      hmUI.updateStatusBarTitle('Sim pair OK')
    })
    .catch(function(e) {
      if (e.message !== 'handled') hmUI.showToast({ text: e.message || 'Error' })
    })
}

const onLock   = () => sendCommand(1, 'Locking')
const onUnlock = () => sendCommand(0, 'Unlocking')
// Closure IDs: rear trunk=5, front trunk (frunk)=6; moveType MOVE=0
const onTrunk  = () => sendClosure(5, 0, 'Trunk')
const onFrunk  = () => sendClosure(6, 0, 'Frunk')

Page(BasePage({
  build() {
    currentPage = this
    setWakeUpRelaunch(true)
    setPageBrightTime(300)

    var currentCount = teslaSession.getPoolSize()
    currentPage
      .request({ method: 'BLE_SYNC_POOL', params: { currentCount } })
      .then((r) => { if (r.success && r.pool) store.keyPool = binaryStringToBytes(r.pool) })
      .catch(() => {})

    // Sync vehicle name and VIN from companion settingsStorage on app start
    currentPage
      .request({ method: 'GET_SETTINGS' })
      .then((r) => { if (r && r.success) { store.vehicleName = r.vehicleName || null; store.vehicleVin = r.vehicleVin || null } })
      .catch(() => {})





    if (!store.vehicleMac ||
        !store.vehicleEcPublicKey ||
        !store.vehicleDoublingsTable) {
      // push({ url: 'page/wizard/index' })
      // return
    }

    onKey({
      callback: (key, keyEvent) => {
        if (key === KEY_SELECT && keyEvent === KEY_EVENT_CLICK) {
          vehicleState.locked ? onUnlock() : onLock()
        }
        return false
      },
    })

    render()
    hmUI.setStatusBarVisible(false)
    keepScreenOn(true)
    
  },
}))
