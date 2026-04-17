import { BasePage } from '@zeppos/zml/base-page'
import { getDeviceInfo } from '@zos/device'
import { setPageBrightTime, setWakeUpRelaunch } from '@zos/display'
import { KEY_EVENT_CLICK, KEY_SELECT, onKey } from '@zos/interaction'
import { push } from '@zos/router'
import * as hmUI from '@zos/ui'
import { CLOSE, LOCK, OPEN, UNLOCK } from '../../pages/styles'

import UI, { button, img, page, rect } from '../../pages/ui'
import vibrate from '../../pages/vibrate'
import { keepScreenOn } from '../../zeppify/index.js'
import Phone from '../lib/phone.js'
import store from '../lib/store.js'
import tesla from '../lib/tesla.js'

const { height } = getDeviceInfo()

var phone = null

const render = () => {
  UI.reset()
  const slide1 = page(0, 0)

  // Car state images
  tesla.locked && img({ w: 352, h: 460, src: 'Y_Top_View_Dark.png' }, slide1)
  !tesla.locked && img({ w: 352, h: 460, src: 'Y_Top_View.png' }, slide1)
  tesla.frunkOpen && img({ w: 352, h: 460, src: 'Y_Frunk.png' }, slide1)
  tesla.trunkOpen && img({ w: 352, h: 460, src: 'Y_Trunk.png' }, slide1)
  tesla.pf && img({ w: 352, h: 460, src: 'Y_Right_Front_Door.png' }, slide1)
  tesla.pr && img({ w: 352, h: 460, src: 'Y_Right_Back_Door.png' }, slide1)
  tesla.df && img({ w: 352, h: 460, src: 'Y_Left_Front_Door.png' }, slide1)
  tesla.dr && img({ w: 352, h: 460, src: 'Y_Left_Back_Door.png' }, slide1)

  // Offline overlay
  if (tesla.connection.status !== 'online') {
    rect({ w: 352, h: 460, color: 0x000000, alpha: 0.6 }, slide1)

    const statusText = tesla.connection.status === 'checking' ? 'Connecting...' : 'Connection Failed'
    button(
      {
        centered: true,
        x: 0,
        y: 80,
        w: 340,
        h: 60,
        text: statusText,
        text_size: 18,
        color: 0xcccccc,
        normal_color: 0x222222,
        press_color: 0x333333,
        radius: 8,
      },
      slide1,
    )

    if (tesla.connection.error) {
      button(
        {
          centered: true,
          x: 0,
          y: 160,
          w: 340,
          h: 50,
          text: tesla.connection.error.substring(0, 30),
          text_size: 12,
          color: 0xffaaaa,
          normal_color: 0x220000,
          press_color: 0x330000,
          radius: 6,
        },
        slide1,
      )
    }

    button(
      {
        centered: true,
        x: 0,
        y: 240,
        w: 280,
        h: 50,
        text: 'Retry',
        text_size: 16,
        color: 0xffff99,
        normal_color: 0x333300,
        press_color: 0x444400,
        radius: 6,
        click_func: () => tesla.retry(),
      },
      slide1,
    )

    button(
      {
        centered: true,
        x: 0,
        y: 310,
        w: 280,
        h: 50,
        text: 'BLE Setup',
        text_size: 16,
        color: 0x99ccff,
        normal_color: 0x003366,
        press_color: 0x004488,
        radius: 6,
        click_func: () => push({ url: 'page/ble/index' }),
      },
      slide1,
    )

    button(
      {
        centered: true,
        x: 0,
        y: 375,
        w: 280,
        h: 50,
        text: 'Simulate Pair',
        text_size: 16,
        color: 0x99ffcc,
        normal_color: 0x003322,
        press_color: 0x004433,
        radius: 6,
        click_func: onSimulatePair,
      },
      slide1,
    )

    return
  }

  // Online controls
  tesla.frunkOpen && button({ ...CLOSE, y: -150, w: 200, h: 160, click_func: onFrunk }, slide1)
  !tesla.frunkOpen && button({ ...OPEN, y: -160, w: 200, h: 160, click_func: onFrunk }, slide1)
  tesla.trunkOpen && button({ ...CLOSE, y: 160, w: 200, h: 160, click_func: onTrunk }, slide1)
  !tesla.trunkOpen && button({ ...OPEN, y: 150, w: 200, h: 160, click_func: onTrunk }, slide1)
  tesla.locked && button({ ...LOCK, w: 100, h: 110, click_func: onUnlock }, slide1)
  !tesla.locked && button({ ...UNLOCK, w: 100, h: 110, click_func: onLock }, slide1)

  rect({ w: 40, h: 20, y: height / 2 - 18, color: 0x000000 }, slide1)

  button(
    {
      centered: false,
      x: 108,
      y: 217,
      w: 72,
      h: 36,
      text: 'BLE',
      text_size: 13,
      color: 0x555555,
      normal_color: 0x111111,
      press_color: 0x222222,
      radius: 6,
      click_func: () => push({ url: 'page/ble/index' }),
    },
    slide1,
  )
}

const onLock = () => {
  hmUI.updateStatusBarTitle('Locking…')
  tesla.lock((r) => {
    hmUI.updateStatusBarTitle(r.success ? '✓ Locked' : '✗ Error')
    if (r.success) vibrate(24)
    else hmUI.showToast({ text: r.error || 'Error' })
  })
}

const onUnlock = () => {
  hmUI.updateStatusBarTitle('Unlocking…')
  tesla.unlock((r) => {
    hmUI.updateStatusBarTitle(r.success ? '✓ Unlocked' : '✗ Error')
    if (r.success) vibrate(24)
    else hmUI.showToast({ text: r.error || 'Error' })
  })
}

const onTrunk = () => {
  hmUI.updateStatusBarTitle('Trunk…')
  tesla.trunk((r) => {
    hmUI.updateStatusBarTitle(r.success ? '✓ Trunk' : '✗ Error')
    if (r.success) vibrate(24)
    else hmUI.showToast({ text: r.error || 'Error' })
  })
}

const onFrunk = () => {
  hmUI.updateStatusBarTitle('Frunk…')
  tesla.frunk((r) => {
    hmUI.updateStatusBarTitle(r.success ? '✓ Frunk' : '✗ Error')
    if (r.success) vibrate(24)
    else hmUI.showToast({ text: r.error || 'Error' })
  })
}

const onSimulatePair = () => {
  hmUI.updateStatusBarTitle('Simulating pair...')
  phone.simulatePair((r) => {
    if (r.success) {
      hmUI.showToast({ text: 'Simulate pair OK' })
      hmUI.updateStatusBarTitle('Sim pair OK')
      tesla.connect()
    } else {
      hmUI.showToast({ text: r.error || 'Simulate failed' })
      hmUI.updateStatusBarTitle('Sim pair failed')
    }
  })
}

Page(
  BasePage({
    build() {
      setWakeUpRelaunch(true)
      setPageBrightTime(300)

      phone = new Phone(this)
      if (store.keyPoolCount < 10) phone.syncPool()
      phone.syncSettings()

      tesla.onChange(render)
      tesla.connect()

      onKey({
        callback: (key, keyEvent) => {
          if (key === KEY_SELECT && keyEvent === KEY_EVENT_CLICK) {
            tesla.locked ? tesla.unlock() : tesla.lock()
          }
          return false
        },
      })

      render()
      hmUI.setStatusBarVisible(false)
      keepScreenOn(true)
    },

    onDestroy() {
      tesla.offChange(render)
      keepScreenOn(false)
    },
  }),
)
