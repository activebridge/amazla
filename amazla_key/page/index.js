import * as hmUI from '@zos/ui'
import { setWakeUpRelaunch, setPageBrightTime } from '@zos/display'
import { getDeviceInfo } from '@zos/device'
import { onKey, KEY_SELECT, KEY_EVENT_CLICK } from '@zos/interaction'
import { push } from '@zos/router'
import { BasePage } from '@zeppos/zml/base-page'
import { writeFileSync, readFileSync } from '@zos/fs'
import { keepScreenOn } from '../../zeppify/index.js'

import UI, { page, button, img, rect } from '../../pages/ui'
import { LOCK, UNLOCK, CLOSE, OPEN } from '../../pages/styles'
import vibrate from '../../pages/vibrate'

import teslaSession from '../lib/tesla-ble/session.js'

const { height } = getDeviceInfo()

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

const render = () => {
  const { locked, df, dr, pf, pr, trunkOpen, frunkOpen } = vehicleState

  UI.reset()
  const slide1 = page(0, 0)

  // If offline, show simplified UI with help
  if (connectionState.status !== 'online') {
    rect({ w: 352, h: 460, color: 0x1a1a1a }, slide1)
    
    const statusText = connectionState.status === 'checking' ? '⏳ Connecting...' : '❌ Connection Failed'
    button({
      centered: true, x: 0, y: 80,
      w: 350, h: 60,
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
      text: '🔄 Retry', text_size: 16, color: 0xffff99,
      normal_color: 0x333300, press_color: 0x444400, radius: 6,
      click_func: onRetryConnection,
    }, slide1)
    
    // Go to BLE page button
    button({
      centered: true, x: 0, y: 310,
      w: 280, h: 50,
      text: '⚙️ BLE Setup', text_size: 16, color: 0x99ccff,
      normal_color: 0x003366, press_color: 0x004488, radius: 6,
      click_func: onGoToBLE,
    }, slide1)
    
    return
  }

  // Normal online UI
  locked  && img({ w: 352, h: 460, src: 'Y_Top_View_Dark.png' }, slide1)
  !locked && img({ w: 352, h: 460, src: 'Y_Top_View.png' },      slide1)
  frunkOpen && img({ w: 352, h: 460, src: 'Y_Frunk.png' },           slide1)
  trunkOpen && img({ w: 352, h: 460, src: 'Y_Trunk.png' },           slide1)
  pf && img({ w: 352, h: 460, src: 'Y_Right_Front_Door.png' }, slide1)
  pr && img({ w: 352, h: 460, src: 'Y_Right_Back_Door.png' },  slide1)
  df && img({ w: 352, h: 460, src: 'Y_Left_Front_Door.png' },  slide1)
  dr && img({ w: 352, h: 460, src: 'Y_Left_Back_Door.png' },   slide1)

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

const onLock   = () => sendCommand(1, 'Locking')
const onUnlock = () => sendCommand(0, 'Unlocking')
const onTrunk  = () => sendCommand(2, 'Trunk')
const onFrunk  = () => sendCommand(3, 'Frunk')

Page(BasePage({
  build() {
    setWakeUpRelaunch(true)
    setPageBrightTime(300)

    storage.load()
    teslaSession.setStorage(storage)

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
    
    // Auto-establish session if pairing data exists
    setTimeout(() => {
      teslaSession.ensureSessionEstablished(function(result) {
        if (result.success) {
          console.log('[INDEX] Session established automatically')
          refreshStatus()
        } else {
          console.log('[INDEX] ' + (result.error || 'Session setup failed'))
          // Show offline status
          setTimeout(refreshStatus, 500)
        }
      })
    }, 100)
  },
}))
