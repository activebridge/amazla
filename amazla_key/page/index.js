import { getDeviceInfo } from '@zos/device'
import { setPageBrightTime, setWakeUpRelaunch } from '@zos/display'
import { KEY_EVENT_CLICK, KEY_SELECT, onKey } from '@zos/interaction'
import { push } from '@zos/router'
import * as hmUI from '@zos/ui'
import { CLOSE, LOCK, OPEN, UNLOCK } from '../../pages/styles'

import UI, { button, circle, img, page, rect, text } from '../../pages/ui'
import vibrate from '../../pages/vibrate'
import { keepScreenOn } from '../../zeppify/index.js'

import Phone from '../lib/phone.js'
import tesla from '../lib/tesla.js'
import BLE from '../lib/tesla-ble/index.js'
import teslaSession from '../lib/tesla-ble/session.js'

const { height } = getDeviceInfo()

var phone = null
// Tracks the scroll-view page count we last configured (1 = offline single
// screen, 2 = online car + debug). render() runs on every state change incl.
// live status pushes; we only (re)configure scroll — and snap to page 0 — when
// this count actually changes, so a push never yanks the user off the debug
// screen they scrolled to.
var scrollPages = 0

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

  // Offline overlay — single screen, no scroll.
  if (tesla.connection.status !== 'online') {
    if (scrollPages !== 1) {
      hmUI.setScrollView(false)
      scrollPages = 1
    }
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
        text: 'Pair',
        text_size: 16,
        color: 0xaaffaa,
        normal_color: 0x113311,
        press_color: 0x224422,
        radius: 6,
        click_func: () => push({ url: 'page/pairing/index' }),
      },
      slide1,
    )

    button(
      {
        centered: true,
        x: 0,
        y: 435,
        w: 280,
        h: 50,
        text: 'Test Purchase',
        text_size: 16,
        color: 0xffcc66,
        normal_color: 0x332200,
        press_color: 0x443300,
        radius: 6,
        click_func: onTestPurchase,
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

  // Charge port (rear driver-side). VCSEC ClosureMoveRequest.chargePort (field 7) —
  // same authenticated closure path as trunk/frunk. When closed, an OPEN button at
  // the port location; when open, a cyan status dot (no PNG overlay for Model Y).
  !tesla.chargePortOpen && button({ ...OPEN, x: -130, y: 40, w: 100, h: 100, click_func: onChargePort }, slide1)
  tesla.chargePortOpen && circle({ centered: true, x: -110, y: 150, radius: 12, color: 0x00ccff }, slide1)

  // Battery readout (infotainment domain, pull-only). Loaded on connect — painted
  // from cache instantly, refreshed by the live fetch. Tap to refresh on demand
  // (no charge pushes exist, so an idle screen would otherwise go stale). The
  // capture timestamp dims a stale value so a cached "Charging" can't mislead.
  renderCharge(slide1)

  rect({ w: 40, h: 20, y: height / 2 - 18, color: 0x000000 }, slide1)

  // ── Screen 2: debug controls (scroll down from the car) ──────────────────
  const slide2 = page(0, 1)

  button(
    {
      centered: true,
      x: 0,
      y: -150,
      w: 200,
      h: 36,
      text: 'Debug',
      text_size: 18,
      color: 0x666666,
      normal_color: 0x000000,
      press_color: 0x000000,
      radius: 0,
    },
    slide2,
  )

  button(
    {
      centered: true,
      x: 0,
      y: -80,
      w: 280,
      h: 56,
      text: 'BLE',
      text_size: 16,
      color: 0x99ccff,
      normal_color: 0x003366,
      press_color: 0x004488,
      radius: 8,
      click_func: () => push({ url: 'page/ble/index' }),
    },
    slide2,
  )

  button(
    {
      centered: true,
      x: 0,
      y: 0,
      w: 280,
      h: 56,
      text: 'KPAY',
      text_size: 16,
      color: 0xffcc66,
      normal_color: 0x332200,
      press_color: 0x443300,
      radius: 8,
      click_func: onTestPurchase,
    },
    slide2,
  )

  // Two vertically-stacked, full-height pages; start on the car (page 0). Only
  // reconfigure when we first go online (offline→online) — re-running this on
  // every status push would snap the user back to the car off the debug screen.
  if (scrollPages !== 2) {
    hmUI.setScrollView(true, height, 2, true)
    hmUI.scrollToPage(0, false)
    scrollPages = 2
  }
}

// Battery % + charging state at the top of the car screen. Color: green while
// charging, amber when low, white otherwise; greyed when the snapshot is stale
// (> 1 h old) so a cached value reads as "old", not current. A wide transparent
// button over the text makes the whole readout a tap-to-refresh target.
const CHARGE_STALE_SEC = 3600
const renderCharge = (slide1) => {
  const c = tesla.charge
  if (!c || typeof c.level !== 'number') return
  const stale = Math.floor(Date.now() / 1000) - (c.ts || 0) > CHARGE_STALE_SEC
  let color = 0xffffff
  if (stale) color = 0x888888
  else if (c.state === 'Charging') color = 0x44dd44
  else if (c.level <= 20) color = 0xffaa33
  const showState = c.state && c.state !== 'Disconnected' && c.state !== 'Unknown'
  const label = showState ? c.level + '% · ' + c.state : c.level + '%'
  // Tap target FIRST so the text draws on top and stays legible whether or not
  // `alpha` is honored on a BUTTON (transparent target if it is; a thin status-
  // bar-like strip behind the text if it isn't — either reads fine).
  button({ centered: true, x: 0, y: -211, w: 320, h: 30, text: '', normal_color: 0x000000, press_color: 0x111111, alpha: 0, radius: 0, click_func: onChargeRefresh }, slide1)
  text({ centered: true, x: 0, y: -211, w: 320, h: 30, text: label, text_size: 22, color }, slide1)
}

const onChargeRefresh = () => {
  if (tesla.connection.status !== 'online') return
  hmUI.updateStatusBarTitle('Charge…')
  tesla.fetchChargeState((r) => {
    hmUI.updateStatusBarTitle(r.success ? '✓ Charge' : '✗ Charge')
    if (!r.success) hmUI.showToast({ text: r.error || 'Charge unavailable' })
  })
}

const onTestPurchase = () => {
  const app = getApp()
  const kpay = app && app._options && app._options.globalData && app._options.globalData.kpay
  if (!kpay) {
    hmUI.showToast({ text: 'kpay not ready' })
    return
  }
  hmUI.updateStatusBarTitle('Starting purchase…')
  kpay.startPurchase()
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

const onChargePort = () => {
  hmUI.updateStatusBarTitle('Charge port…')
  tesla.chargePort((r) => {
    hmUI.updateStatusBarTitle(r.success ? '✓ Charge port' : '✗ Error')
    if (r.success) vibrate(24)
    else hmUI.showToast({ text: r.error || 'Error' })
  })
}

Page({
  build() {
    setWakeUpRelaunch(true)
    setPageBrightTime(300)

    phone = new Phone()

    tesla.onChange(render)

    // Auto-establish the BLE session on open and pull the live car state. If not
    // paired/in range, refresh() lands the offline overlay (Retry / BLE Setup).
    // Once online this also arms the live-push listener so opening a door, etc.
    // repaints the page without any user action.
    //
    // Settings sync (vehicle name/VIN from the companion) is a phone RPC that shares the
    // single BLE radio with the car connection. When PAIRED, connect() does a real BLE
    // scan/GATT/session, so defer the sync until that settles to avoid contention. When
    // not paired, connect() fast-fails on the enrollment gate (no BLE) and lands the
    // offline overlay (Retry / BLE Setup) — no contention, so sync immediately.
    // Gate auto-connect on isPaired, not just a cached VIN: a VIN can be synced without
    // the enrolled keypair/session, and that can't establish a session.
    if (tesla.isPaired) {
      let synced = false
      tesla.onChange(() => {
        if (synced || tesla.connection.status === 'checking') return
        synced = true
        phone.syncSettings()
      })
    } else {
      phone.syncSettings()
    }
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
    // Auto-lock on close: passive entry only locks while connected, and closing the
    // app drops BLE — so a car left unlocked stays unlocked. Fire a synchronous lock
    // (no ACK wait — we reset right after) if still connected to an unlocked, empty
    // car. MUST run BEFORE teslaSession.reset() below, which tears down the link.
    try {
      tesla.lockOnClose()
    } catch (_e) {}
    // Free BLE so next launch doesn't inherit poisoned native state.
    // Without this, mstConnect on the next session-info attempt returns
    // status:"failed" after ~30s until the watch is rebooted.
    try {
      teslaSession.reset()
    } catch (_e) {}
    try {
      BLE.reset()
    } catch (_e) {}
  },
})
