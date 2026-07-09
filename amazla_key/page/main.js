import { Connecting } from './components/connecting.js'
import Status from './components/status.js'
import { setPageBrightTime, setWakeUpRelaunch } from '@zos/display'
import { getText } from '@zos/i18n'
import { KEY_EVENT_CLICK, KEY_SELECT, MODAL_CONFIRM, createModal, onKey } from '@zos/interaction'
import * as hmUI from '@zos/ui'
import { CLOSE, LOCK, OPEN, UNLOCK } from '../../pages/styles'
import UI, { button, height } from '../../pages/ui'
import { CarImages } from './components/carImages.js'
import { safe } from '../shared/safe.js'
import { keepScreenOn, vibro } from '../../zeppify/index.js'

// Shared main-app controller. The full experience — connect, render, controls,
// live-push listener, passive-entry toasts, unpair — lives here ONCE, so the
// primary page (page/index.js) and the secondary widget (secondary-widget/
// index.js) behave identically. Each host is a thin adapter that calls build()/
// destroy() and supplies navigate(url): the page uses replace(), the widget uses
// push(). Navigation is the only behavioural difference between the two contexts.

// ─── Backend toggle ─────────────────────────────────────────────────────────
// REAL (device / on-car): the BLE + crypto lib. tesla is the facade — it owns
// session/BLE teardown (tesla.shutdown()).
import Phone from '../lib/phone.js'
import tesla from '../lib/tesla.js'

// MOCK (simulator only — the real lib OOMs the SIM): comment the 2 imports above
// and uncomment the line below to develop the UI without a car.
// import { tesla, Phone } from './tesla-mock.js'

let phone = null
let status = null
let navigate = null
// Unlicensed = KiezelPay reports no license. It's a terminal render state (no BLE,
// no controls) rather than a connection state, so it's tracked separately and wins
// in statusKey below — see build().
let unlicensed = false

// Map the live BLE connection state (tesla.js: checking → online → offline/error)
// to a status-component key. Driven by tesla.onChange(render), so every real
// connection transition — scan, session-established, drop — repaints the label.
// Unlicensed wins: we never connect while unlicensed, so it's not a connection state.
const statusKey = () => {
  if (unlicensed) return 'unlicensed'
  if (tesla.connection.status === 'online') return 'online'
  if (tesla.connection.status === 'checking') return 'checking'
  return tesla.connection.error ? 'failed' : 'offline'
}

const render = () => {
  UI.reset()
  // Single screen — no groups, no scroll. Status arc first so it's the bottom of the
  // z-stack; the car images and buttons paint on top of it and receive taps.
  status && status.update(statusKey())

  // Car state images (top level) — shared with the secondary widget.
  CarImages(tesla)

  // Reset/unpair — one full screen-height down (y: height centers it on the next page),
  // so it's out of the way but reachable by scrolling. Shown in every state (added
  // before the offline early-return) so the watch can always be unpaired.
  button({
    centered: true,
    x: 0,
    y: height,
    w: 260,
    h: 64,
    text: getText('reset_btn'),
    text_size: 18,
    color: 0xff6666,
    normal_color: 0x330000,
    press_color: 0x440000,
    radius: 10,
    click_func: confirmReset,
  })

  // Unlicensed: cached car + the "Unlicensed" status + a Purchase button (KiezelPay
  // has no trial). No spinner, no car controls, no BLE. The purchase dialog opens
  // ONLY on this button tap — never auto-opened — so the secondary widget never pops
  // the payment page from the watchface, and an unlicensed user can't operate the car.
  if (unlicensed) {
    button({
      centered: true,
      w: 200,
      h: 72,
      text: getText('purchase_btn'),
      text_size: 22,
      color: 0xffffff,
      normal_color: 0x0a5c2a,
      press_color: 0x0d7a37,
      radius: 12,
      click_func: startPurchase,
    })
    return
  }

  // Not online: while CONNECTING show the dim veil + spinner over the cached car;
  // otherwise (offline/failed) just the cached car under the status arc. No buttons.
  if (tesla.connection.status !== 'online') {
    if (tesla.connection.status === 'checking') Connecting()
    return
  }

  // Online controls
  tesla.frunkOpen && button({ ...CLOSE, y: -150, w: 200, h: 160, click_func: onFrunk })
  !tesla.frunkOpen && button({ ...OPEN, y: -160, w: 200, h: 160, click_func: onFrunk })
  tesla.trunkOpen && button({ ...CLOSE, y: 160, w: 200, h: 160, click_func: onTrunk })
  !tesla.trunkOpen && button({ ...OPEN, y: 150, w: 200, h: 160, click_func: onTrunk })
  tesla.locked && button({ ...LOCK, w: 100, h: 110, click_func: onUnlock })
  !tesla.locked && button({ ...UNLOCK, w: 100, h: 110, click_func: onLock })
}

const _onChargeRefresh = () => {
  if (tesla.connection.status !== 'online') return
  tesla.fetchChargeState((r) => {
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

// Full unpair. Clears the phone's settingsStorage (RESET RPC) and the watch's storage +
// live session (tesla.reset()), then routes back to pairing (now unenrolled → setup).
const doReset = () => {
  try {
    if (phone) phone.reset(() => {})
  } catch (_e) {}
  tesla.reset()
  navigate('page/pairing/index')
}

// Confirm before wiping — a stray tap shouldn't unpair the car.
const confirmReset = () => {
  const dialog = createModal({
    content: getText('reset_confirm'),
    autoHide: true,
    onClick: (keyName) => {
      if (keyName === MODAL_CONFIRM) doReset()
    },
  })
  dialog.show(true)
}

const onLock = () => {
  tesla.lock((r) => {
    if (r.success) vibro.medium()
    else hmUI.showToast({ text: r.error || 'Error' })
  })
}

const onUnlock = () => {
  // Toasts (not updateStatusBarTitle — the status bar is hidden via setStatusBarVisible(false),
  // so those titles never show). Toast on send, then on the result.
  hmUI.showToast({ text: 'Unlocking…' })
  tesla.unlock((r) => {
    hmUI.showToast({ text: r.success ? '✓ Unlocked' : r.error || '✗ Error' })
    if (r.success) vibro.medium()
  })
}

const onTrunk = () => {
  tesla.trunk((r) => {
    if (r.success) vibro.medium()
    else hmUI.showToast({ text: r.error || 'Error' })
  })
}

const onFrunk = () => {
  tesla.frunk((r) => {
    if (r.success) vibro.medium()
    else hmUI.showToast({ text: r.error || 'Error' })
  })
}

const _onChargePort = () => {
  tesla.chargePort((r) => {
    if (r.success) vibro.medium()
    else hmUI.showToast({ text: r.error || 'Error' })
  })
}

const _onStartCharge = () => {
  tesla.startCharge((r) => {
    if (r.success) vibro.medium()
    else hmUI.showToast({ text: r.error || 'Error' })
  })
}

const _onStopCharge = () => {
  tesla.stopCharge((r) => {
    if (r.success) vibro.medium()
    else hmUI.showToast({ text: r.error || 'Error' })
  })
}

// Mount the main experience. host.navigate(url) is the only host-specific hook —
// the page passes replace(), the widget passes push(). Page-context APIs (display,
// key, status bar) are guarded so a more-restricted widget runtime can't crash the
// whole view if one is unavailable.
export function build(host) {
  navigate = host.navigate
  safe('setWakeUpRelaunch', () => setWakeUpRelaunch(true))
  safe('setPageBrightTime', () => setPageBrightTime(300))

  // Not fully paired → send the user to the pairing page (it lands on "setup" if no
  // VIN yet, else "ready"). isPaired = enrolled + cached session key, so an INTERRUPTED
  // pairing (EC key written but session never derived) correctly counts as not paired
  // and re-enters the flow — no dead-end. This is a UI routing decision, which is what
  // store.isPaired is for (the connect gate stays isEnrolled).
  if (!tesla.isPaired) {
    navigate('page/pairing/index')
    return
  }

  unlicensed = !isLicensed()
  status = Status(statusKey())

  // Kezel/KPAY has no time-based trial. Treat unlicensed as a terminal render state:
  // paint the cached car under an "Unlicensed" label + a Purchase button, and STOP —
  // no BLE, no car controls. Purchase starts only when the user taps that button
  // (see render()), so nothing auto-opens the payment page: the widget won't pop it
  // from the watchface, and an unlicensed user can't operate the car from it.
  if (unlicensed) {
    render()
    safe('setStatusBarVisible', () => hmUI.setStatusBarVisible(false))
    safe('keepScreenOn', () => keepScreenOn(true))
    return
  }

  phone = new Phone()

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

  // Auto-establish the BLE session on open and pull the live car state; once online
  // this also arms the live-push listener so opening a door, etc. repaints the view.
  //
  // Settings sync (vehicle name/VIN from the companion) is a phone RPC that shares the
  // single BLE radio with the car connection. We only reach here when PAIRED (unpaired
  // was redirected above), and connect() does a real BLE scan/GATT/session — so defer
  // the sync until that settles (first non-'checking' onChange) to avoid radio contention.
  let synced = false
  tesla.onChange(() => {
    if (synced || tesla.connection.status === 'checking') return
    synced = true
    phone.syncSettings()
  })
  tesla.connect()

  safe('onKey', () =>
    onKey({
      callback: (key, keyEvent) => {
        if (key === KEY_SELECT && keyEvent === KEY_EVENT_CLICK) {
          tesla.locked ? tesla.unlock() : tesla.lock()
        }
        return false
      },
    }),
  )

  render()
  safe('setStatusBarVisible', () => hmUI.setStatusBarVisible(false))
  safe('keepScreenOn', () => keepScreenOn(true))
}

export function destroy() {
  tesla.offChange(render)
  safe('keepScreenOn', () => keepScreenOn(false))
  // Auto-lock (if still connected to an unlocked, empty car) then free the native
  // BLE/session state so the next launch isn't poisoned. tesla owns that teardown —
  // see tesla.shutdown().
  tesla.shutdown()
}
