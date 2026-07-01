// Screen-type-specific battery: `[pf]` resolves to battery.r.layout.js (round,
// full charging arc) or battery.s.layout.js (square, text placeholder) at build
// time. The `.[pf].layout.js` suffix is required by the zosLoader resolver.
import { Battery } from 'zosLoader:./components/battery.[pf].layout.js'
import { Connecting } from 'zosLoader:./components/connecting.[pf].layout.js'
import Status from 'zosLoader:./components/status.[pf].layout.js'
import { getDeviceInfo } from '@zos/device'
import { setPageBrightTime, setWakeUpRelaunch } from '@zos/display'
import { KEY_EVENT_CLICK, KEY_SELECT, onKey } from '@zos/interaction'
import { push } from '@zos/router'
import * as hmUI from '@zos/ui'
import { CLOSE, LOCK, OPEN, UNLOCK } from '../../pages/styles'
import UI, { button, img, page, rect } from '../../pages/ui'
import { keepScreenOn, vibro } from '../../zeppify/index.js'

// ─── Backend toggle ─────────────────────────────────────────────────────────
// REAL (device / on-car): the BLE + crypto lib. Active for testing on a Tesla.
// tesla is the facade — it owns session/BLE teardown (tesla.shutdown()), so the page
// no longer imports teslaSession/BLE directly.
import Phone from '../lib/phone.js'
import tesla from '../lib/tesla.js'
// MOCK (simulator only — the real lib OOMs the SIM): comment the 2 imports above
// and uncomment the line below to develop the UI without a car.
// import { tesla, Phone } from './tesla-mock.js'

const { height } = getDeviceInfo()

var phone = null
// Connection-status arc label at 6 o'clock. render() repaints it last (after
// UI.reset() clears the previous one) so it always lands on top of the car images.
var status = null

// Map the live BLE connection state (tesla.js: checking → online → offline/error)
// to a status-component key. Driven by tesla.onChange(render), so every real
// connection transition — scan, session-established, drop — repaints the label.
const statusKey = () => {
  if (tesla.connection.status === 'online') return 'online'
  if (tesla.connection.status === 'checking') return 'checking'
  return tesla.connection.error ? 'failed' : 'offline'
}

// Tracks the scroll-view page count we last configured (1 = offline single
// screen, 2 = online car + debug). render() runs on every state change incl.
// live status pushes; we only (re)configure scroll — and snap to page 0 — when
// this count actually changes, so a push never yanks the user off the debug
// screen they scrolled to.
var scrollPages = 0

const render = () => {
  UI.reset()
  // Status arc FIRST (before slide1), so it's the bottom of the z-stack — the whole
  // slide1 group (car images + lock/unlock/frunk/trunk buttons) renders on top and
  // receives taps. Painting it last made its full-screen text box steal button taps.
  status && status.update(statusKey())
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
    // While CONNECTING: the dim-circle overlay + animated spinner, no buttons. The
    // status component (bottom arc) shows "Connecting". On a FAILED/offline state:
    // the dim rect + Pair / Test Purchase actions.
    if (tesla.connection.status === 'checking') {
      Connecting(slide1)
    } else {
      rect({ w: 352, h: 460, color: 0x000000, alpha: 0.6 }, slide1)

      button(
        {
          centered: true,
          x: 0,
          y: 310,
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
          y: 375,
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
    }

    return
  }

  // Battery readout (infotainment domain, pull-only). Loaded on connect — painted
  // from cache instantly, refreshed by the live fetch. Tap to refresh on demand
  // (no charge pushes exist, so an idle screen would otherwise go stale). Round
  // screens get the full charging arc; square screens a text placeholder — the
  // right one is bundled per device (see the zosLoader import above).
  // DISABLED for now: charge runs over the infotainment (d3) BLE domain, which
  // shares the single response slot with VCSEC and was starving status/commands.
  // VCSEC-only until that's untangled. Re-enable this line + the charge button below.
  // Battery(slide1, tesla.charge, tesla.primaryState, onChargeRefresh)

  // Online controls
  tesla.frunkOpen && button({ ...CLOSE, y: -150, w: 200, h: 160, click_func: onFrunk }, slide1)
  !tesla.frunkOpen && button({ ...OPEN, y: -160, w: 200, h: 160, click_func: onFrunk }, slide1)
  tesla.trunkOpen && button({ ...CLOSE, y: 160, w: 200, h: 160, click_func: onTrunk }, slide1)
  !tesla.trunkOpen && button({ ...OPEN, y: 150, w: 200, h: 160, click_func: onTrunk }, slide1)
  tesla.locked && button({ ...LOCK, w: 100, h: 110, click_func: onUnlock }, slide1)
  !tesla.locked && button({ ...UNLOCK, w: 100, h: 110, click_func: onLock }, slide1)

  // Charge button (rear driver-side). Context-aware:
  //  • cable UNPLUGGED → open/close the charge port (open_charger/close_charger).
  //  • cable PLUGGED IN → start/stop charging (start_charge ▶ / stop_charge ■).
  // DISABLED for now (infotainment d3 BLE shares the VCSEC response slot). Re-enable
  // together with the Battery readout above.
  // const chargeBtn = { x: -130, y: 110, w: 100, h: 100 }
  // if (!tesla.pluggedIn) {
  //   !tesla.chargePortOpen && button({ ...chargeBtn, src: 'open_charger', click_func: onChargePort }, slide1)
  //   tesla.chargePortOpen && button({ ...chargeBtn, src: 'close_charger', click_func: onChargePort }, slide1)
  // } else if (tesla.charge.state === 'Charging') {
  //   button({ ...chargeBtn, src: 'stop_charge', click_func: onStopCharge }, slide1)
  // } else {
  //   button({ ...chargeBtn, src: 'start_charge', click_func: onStartCharge }, slide1)
  // }

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

const onChargeRefresh = () => {
  if (tesla.connection.status !== 'online') return
  hmUI.updateStatusBarTitle('Charge…')
  tesla.fetchChargeState((r) => {
    hmUI.updateStatusBarTitle(r.success ? '✓ Charge' : '✗ Charge')
    if (!r.success) hmUI.showToast({ text: r.error || 'Charge unavailable' })
  })
}

// KPAY / Kezel in-app purchase lives on the app instance (see app.js globalData).
// The product has NO time-based trial (kpay-config trialEnabled:false), so per the
// KiezelPay docs startPurchase() is the only way to begin a purchase — we call it
// ourselves on app start when the app isn't licensed (see build()).
const getKpay = () => {
  const app = getApp()
  return app && app._options && app._options.globalData && app._options.globalData.kpay
}
const isLicensed = () => {
  const kpay = getKpay()
  return kpay ? kpay.isLicensed() : false
}
const startPurchase = () => {
  const kpay = getKpay()
  if (!kpay) {
    hmUI.showToast({ text: 'kpay not ready' })
    return
  }
  kpay.startPurchase()
}

const onTestPurchase = () => {
  hmUI.updateStatusBarTitle('Starting purchase…')
  startPurchase()
}

const onLock = () => {
  hmUI.updateStatusBarTitle('Locking…')
  tesla.lock((r) => {
    hmUI.updateStatusBarTitle(r.success ? '✓ Locked' : '✗ Error')
    if (r.success) vibro.medium()
    else hmUI.showToast({ text: r.error || 'Error' })
  })
}

const onUnlock = () => {
  // Toasts (not updateStatusBarTitle — the status bar is hidden via setStatusBarVisible(false),
  // so those titles never show). Toast on send, then on the result.
  hmUI.showToast({ text: 'Unlocking…' })
  tesla.unlock((r) => {
    hmUI.showToast({ text: r.success ? '✓ Unlocked' : (r.error || '✗ Error') })
    if (r.success) vibro.medium()
  })
}

const onTrunk = () => {
  hmUI.updateStatusBarTitle('Trunk…')
  tesla.trunk((r) => {
    hmUI.updateStatusBarTitle(r.success ? '✓ Trunk' : '✗ Error')
    if (r.success) vibro.medium()
    else hmUI.showToast({ text: r.error || 'Error' })
  })
}

const onFrunk = () => {
  hmUI.updateStatusBarTitle('Frunk…')
  tesla.frunk((r) => {
    hmUI.updateStatusBarTitle(r.success ? '✓ Frunk' : '✗ Error')
    if (r.success) vibro.medium()
    else hmUI.showToast({ text: r.error || 'Error' })
  })
}

const onChargePort = () => {
  hmUI.updateStatusBarTitle('Charge port…')
  tesla.chargePort((r) => {
    hmUI.updateStatusBarTitle(r.success ? '✓ Charge port' : '✗ Error')
    if (r.success) vibro.medium()
    else hmUI.showToast({ text: r.error || 'Error' })
  })
}

const onStartCharge = () => {
  hmUI.updateStatusBarTitle('Start charge…')
  tesla.startCharge((r) => {
    hmUI.updateStatusBarTitle(r.success ? '✓ Charging' : '✗ Error')
    if (r.success) vibro.medium()
    else hmUI.showToast({ text: r.error || 'Error' })
  })
}

const onStopCharge = () => {
  hmUI.updateStatusBarTitle('Stop charge…')
  tesla.stopCharge((r) => {
    hmUI.updateStatusBarTitle(r.success ? '✓ Stopped' : '✗ Error')
    if (r.success) vibro.medium()
    else hmUI.showToast({ text: r.error || 'Error' })
  })
}

Page({
  build() {
    setWakeUpRelaunch(true)
    setPageBrightTime(300)

    // Kezel/KPAY: no time-based trial, so start the purchase ourselves whenever the
    // app isn't licensed yet. Kezel shows its own dialog page — no redirect, the user
    // stays in the app. Fires on every open until the purchase completes.
    if (!isLicensed()) startPurchase()

    phone = new Phone()
    status = Status(statusKey())

    tesla.onChange(render)

    // Passive-entry handshake toasts: show the user the walk-up handshake progressing
    // (car detected the key → accepted it). One toast per milestone per connection.
    // Short haptic acks: 'status' (car answered — synced on connect) and 'authorized'
    // (key accepted by the car during walk-up). Both fire once per connection.
    tesla.onPassiveEvent((evt) => {
      const TXT = {
        initiated: 'Passive entry…',
        approaching: 'Approaching — authorizing',
        authorized: '✓ Key authorized',
      }
      const text = TXT[evt.type]
      if (text) hmUI.showToast({ text })
      if (evt.type === 'status' || evt.type === 'authorized') vibro.medium()
    })

    // No auto-unlock on connect. Firing an explicit unlock the instant we go online raced
    // the passive-entry handshake: on anything but a strong signal the car stays at reason-1
    // IDENTIFICATION for ~10-13s and ignores the signed command until it escalates, so the
    // auto-unlock timed out / reported failure (device 2026-06-29, correlated with RSSI).
    // Walk-up unlock is the car's job via passive entry (we answer its AuthenticationRequest
    // beacons); an explicit unlock is a deliberate user action — the button / SELECT key.

    // Auto-establish the BLE session on open and pull the live car state. If not
    // paired/in range, refresh() lands the offline overlay (Retry / Pair).
    // Once online this also arms the live-push listener so opening a door, etc.
    // repaints the page without any user action.
    //
    // Settings sync (vehicle name/VIN from the companion) is a phone RPC that shares the
    // single BLE radio with the car connection. When PAIRED, connect() does a real BLE
    // scan/GATT/session, so defer the sync until that settles to avoid contention. When
    // not paired, connect() fast-fails on the enrollment gate (no BLE) and lands the
    // offline overlay (Retry / Pair) — no contention, so sync immediately.
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
    // Auto-lock (if still connected to an unlocked, empty car) then free the native
    // BLE/session state so the next launch isn't poisoned. tesla owns that teardown —
    // see tesla.shutdown().
    tesla.shutdown()
  },
})
