import * as hmUI from '@zos/ui'
import { setWakeUpRelaunch, setPageBrightTime } from '@zos/display'
import { getDeviceInfo } from '@zos/device'
import { onKey, KEY_SELECT, KEY_EVENT_CLICK } from '@zos/interaction'
import { push } from '@zos/router'
import { BasePage } from '@zeppos/zml/base-page'
import { writeFileSync, readFileSync } from '@zos/fs'

const readFile = () => {
  const vehicle = readFileSync({ path: 'vehicle.txt', options: { encoding: 'utf8' } })
  return JSON.parse(vehicle || '{}')
}

const writeFile = (data) => {
  return writeFileSync({ path: 'vehicle.txt', data: JSON.stringify(data), options: { encoding: 'utf8' } })
}

import UI, { page, button, img, text, circle, progress } from '../../pages/ui'
import {
  NAME,
  LOCK,
  UNLOCK,
  CHARGING,
  ODOMETER,
  BATTERY_LEVEL,
  BATTERY_RANGE,
  BATTERY,
  CABLE,
  level_color,
  model,
} from '../../pages/styles'
import vibrate from '../../pages/vibrate'
import { getColor } from '../../pages/paint'

const { height } = getDeviceInfo()

let isRunning = false
let currentPage, locked = true

const render = (attrs) => {
  console.log('RENDER')
  console.log(JSON.stringify(attrs))

  let vehicle = attrs || {}

  const {
    name = 'Connect Tesla Account',
    battery_level = 0,
    battery_range = '- - -',
    isCharging = false,
    isConnected = false,
    locked: isLocked = true,
    car_type = 'modely',
    color,
    unit = '㎖',
  } = vehicle

  locked = isLocked

  const chargeColor = isCharging ? 0x00EF33 : level_color(battery_level)
  const carColor = color ? `0x${color}` : chargeColor
  const car = `cars/${model(car_type)}`

  UI.reset()
  const slide1 = page(0, 0)

  // Slide 1: Lock/unlock controls
  locked && img({ w: 352, h: 460, src: 'Y_Top_View_Dark.png' }, slide1)
  !locked && img({ w: 352, h: 460, src: 'Y_Top_View.png' }, slide1)
  locked && button({ ...LOCK, w: 100, h: 110, click_func: onUnlockClick }, slide1)
  !locked && button({ ...UNLOCK, w: 100, h: 110, click_func: onLockClick }, slide1)

  button({ x: 0, y: -150, w: 130, h: 50, text: 'BLE CONTROL', text_size: 15,
    click_func: function() { push({ url: 'page/ble/index' }) }
  }, slide1)

  console.log('RENDERED')
}

const handleBleCommand = (command, isLock) => {
  if (isRunning) return hmUI.showToast({ text: 'Busy…' })
  isRunning = true

  const method = command === 'lock' ? 'DOOR_LOCK' : 'DOOR_UNLOCK'
  const title = isLock ? '🔒 Locking…' : '🔓 Unlocking…'

  currentPage.request({ method }).then(({ error, ...props }) => {
    isRunning = false
    if (error) {
      hmUI.showToast({ text: `Error: ${error}` })
      hmUI.updateStatusBarTitle('Error')
      console.log(`[INDEX] ${command} failed:`, error)
    } else {
      const status = isLock ? '🔒 Locked' : '🔓 Unlocked'
      hmUI.showToast({ text: status })
      hmUI.updateStatusBarTitle(status)
      vibrate(24)
      locked = isLock
      let data = readFile()
      data.locked = isLock
      writeFile(data)
      render(data)
      console.log(`[INDEX] ${command} success`)
    }
  }).catch(error => {
    isRunning = false
    hmUI.showToast({ text: `Error: ${error}` })
    console.log(`[INDEX] ${command} caught error:`, error)
  })
}

const onLockClick = () => {
  hmUI.updateStatusBarTitle('🔒 Locking…')
  handleBleCommand('lock', true)
}

const onUnlockClick = () => {
  hmUI.updateStatusBarTitle('🔓 Unlocking…')
  handleBleCommand('unlock', false)
}

Page(
  BasePage({
    state: {},

    build() {
      setWakeUpRelaunch(true)
      setPageBrightTime(300)
      currentPage = this

      onKey({
        callback: (key, keyEvent) => {
          if (key === KEY_SELECT && keyEvent === KEY_EVENT_CLICK) {
            locked ? onUnlockClick() : onLockClick()
          }
          return false
        },
      })

      render({ ...readFile(), ...{
        online: false,
      }})
      // hmUI.setScrollView(true, height, 2, true)
      // hmUI.scrollToPage(1, false)
      hmUI.setStatusBarVisible(false)
    },
  })
)
