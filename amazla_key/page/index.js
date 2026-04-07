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

var isRunning = false

const render = () => {
  const { locked, df, dr, pf, pr, trunkOpen, frunkOpen } = vehicleState

  UI.reset()
  const slide1 = page(0, 0)

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
      applyStatus(result.status)
      hmUI.updateStatusBarTitle('Online')
      render()
    } else {
      hmUI.updateStatusBarTitle('Offline')
      console.log('[INDEX] getVehicleStatus failed:', result.error)
    }
  })
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
