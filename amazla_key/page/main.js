import { Connecting } from './components/connecting.js'
import Status from './components/status.js'
import { setPageBrightTime, setWakeUpRelaunch } from '@zos/display'
import { getText } from '@zos/i18n'
import { KEY_EVENT_CLICK, KEY_SELECT, KEY_SHORTCUT, onKey } from '@zos/interaction'
import { home } from '@zos/router'
import * as hmUI from '@zos/ui'
import { CLOSE, LOCK, OPEN, UNLOCK } from '../../pages/styles'
import UI, { button, height, img, width } from '../../pages/ui'
import { CarImages } from './components/carImages.js'
import { ResetButton } from './components/reset.js'
import { runConfiguredButtonAction } from '../shared/button-action.js'
import { getConnectionStatusKey } from '../shared/connection-status.js'
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
import store from '../lib/store.js'
import tesla from '../lib/tesla.js'
import { autoExitOnLock, autoUnlock, clearSelfLock, noteSelfLock } from './callbacks.js'

// MOCK (simulator only — the real lib OOMs the SIM): comment the 2 imports above
// and uncomment the line below to develop the UI without a car.
// import { tesla, Phone } from './tesla-mock.js'

let phone = null
let status = null
let navigate = null
let syncListener = null
// Walk-away auto-exit listener (see callbacks.js autoExitOnLock). Module-scope so
// destroy() can deregister it — the secondary widget rebuilds per visit. home() not
// exit(): this file also runs in the secondary-widget context, and going to the
// watchface is right from both. A light buzz first — silent vanishing would read
// as a crash; the buzz says "car locked, done".
const exitListener = () =>
  autoExitOnLock(() => {
    vibro.light()
    safe('home', () => home())
  })
// Unlicensed = KiezelPay reports no license. It's a terminal render state (no BLE,
// no controls) rather than a connection state, so it's tracked separately and wins
// in statusKey below — see build().
let unlicensed = false
// Passive-entry milestone: the car accepted our key during walk-up. Sticky while the
// connection stays online (reset in render when we drop offline), so the status reads
// 'Authorized' instead of 'Connected' — mirrors the app widget. Shared by the main page
// AND the secondary widget (both run this file).
let authorized = false

// Map the live BLE connection state (tesla.js: checking → online → offline/error)
// to a status-component key. Driven by tesla.onChange(render), so every real
// connection transition — scan, session-established, drop — repaints the label.
// Unlicensed wins: we never connect while unlicensed, so it's not a connection state.
const statusKey = () => {
  return getConnectionStatusKey({
    isLicensed: !unlicensed,
    connection: tesla.connection,
    authorized,
  })
}

// Styled text button matching the pairing flow's red pill (buttons/btn-red.png
// background + a transparent BUTTON carrying the shared 'press' tap overlay and the
// label), so Reset/Purchase read like the rest of the app instead of ad-hoc colored
// rects. y is a center-relative offset (see pages/ui.js center()).
const PILL_W = 220
const PILL_H = 72
const pillButton = ({ text, y, onClick }) => {
  img({ src: 'buttons/btn-red.png', y, w: PILL_W, h: PILL_H })
  button({ y, w: PILL_W, h: PILL_H, text, text_size: 28, color: 0xffffff, src: 'press', radius: 0, click_func: onClick })
}

const render = () => {
  UI.reset()
  // 'Authorized' is only meaningful while online — drop it once we leave (so a
  // reconnect starts back at 'Connecting'/'Connected', not a stale 'Authorized').
  if (tesla.connection.status !== 'online') {
    authorized = false
  }
  // Single screen — no groups, no scroll. Status arc first so it's the bottom of the
  // z-stack; the car images and buttons paint on top of it and receive taps.
  status && status.update(statusKey())

  // Car state images (top level) — shared with the secondary widget.
  CarImages(tesla)

  // Reset/unpair — one full screen-height down (y: height centers it on the next page),
  // so it's out of the way but reachable by scrolling. Shown in every state (added
  // before the offline early-return) so the watch can always be unpaired. The button +
  // confirm modal live in components/reset.js; doReset() performs the actual wipe.
  ResetButton({ y: height, onReset: doReset })

  // Unlicensed: cached car + the "Unlicensed" status + a Purchase button (KiezelPay
  // has no trial). No spinner, no car controls, no BLE. The purchase dialog opens
  // ONLY on this button tap — never auto-opened — so the secondary widget never pops
  // the payment page from the watchface, and an unlicensed user can't operate the car.
  if (unlicensed) {
    pillButton({ text: getText('purchase_btn'), y: 0, onClick: startPurchase })
    return
  }

  // Not online: while CONNECTING show the dim veil + spinner over the cached car;
  // otherwise (offline/failed) show the cached car under the status arc and make the
  // whole screen a tap-to-retry target (same as the app-widget card). Added LAST so
  // it's on top of the z-stack and receives the tap. src:'retry' → normal buttons/
  // retry.png is intentionally MISSING (transparent normal, car shows through) and
  // press buttons/_retry.png is a 480×480 full-screen dim overlay, so the WHOLE screen
  // flashes on tap — not the tiny centered _press.png (BUTTON draws press at natural size).
  if (tesla.connection.status !== 'online') {
    if (tesla.connection.status === 'checking') Connecting()
    else button({ y: 0, w: width, h: height, src: 'retry', radius: 0, click_func: onRetry })
    return
  }

  // Online controls
  tesla.frunkOpen && button({ ...CLOSE, y: -150, w: 200, h: 160, click_func: onFrunk })
  !tesla.frunkOpen && button({ ...OPEN, y: -160, w: 200, h: 160, click_func: onFrunk })
  tesla.trunkOpen && button({ ...CLOSE, y: 160, w: 200, h: 160, click_func: onTrunk })
  !tesla.trunkOpen && button({ ...OPEN, y: 150, w: 200, h: 160, click_func: onTrunk })
  tesla.locked && button({ ...LOCK, w: 100, h: 110, click_func: onUnlock })
  !tesla.locked && button({ ...UNLOCK, w: 100, h: 110, click_func: onLock })

  // Command in flight (tesla.busy, set by _runAction, cleared on the result push):
  // dim veil + spinner over the controls. A command can take several seconds — ack
  // wait, timeout+retry with a fresh counter, wake — so without this the screen looks
  // dead between tap and result. Same overlay as the connecting state; drawn last so
  // it's on top. _runAction rejects taps while busy, so the covered buttons are inert.
  if (tesla.busy) Connecting()
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
  if (kpay && kpay.isLicensed()) {
    // Persist: kpay can be null (aborted app onCreate) and its KPAY_STATUS cache
    // lives on the kpay lib's own LocalStorage instance — see store.licensed.
    if (!store.licensed) store.licensed = true
    return true
  }
  return store.licensed
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

// Offline/failed → tap anywhere to re-attempt the BLE connect (same as the app-widget
// card). Ignored while already connecting so a tap mid-attempt can't stack dials.
const onRetry = () => {
  if (tesla.connection.status === 'checking') return
  tesla.connect()
}

const onLock = () => {
  // Mark this lock as user-initiated so the walk-away auto-exit (callbacks.js)
  // doesn't close the app on the resulting locked flip; a FAILED lock clears the
  // mark — no flip is coming, and it must not eat the next real walk-away exit.
  noteSelfLock()
  tesla.lock((r) => {
    if (r.success) vibro.medium()
    else {
      clearSelfLock()
      hmUI.showToast({ text: r.error || 'Error' })
    }
  })
}

const onUnlock = () => {
  // Success is signalled by the haptic + the lock icon flipping (optimistic state);
  // only surface a toast on failure — same as lock/trunk/frunk.
  tesla.unlock((r) => {
    if (r.success) vibro.medium()
    else hmUI.showToast({ text: r.error || 'Error' })
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

// Run the settings-chosen physical-button action. Reads the PERSISTED store.buttonAction
// (synced from the phone); routes through the same handlers as the on-screen controls so
// toasts/haptics/optimistic state all behave identically. Default = lock/unlock toggle.
//
// Not online yet? A press RETRIES the connection (same as tapping the screen when
// offline/failed) instead of firing a command that would just toast "Offline". onRetry
// no-ops while already 'checking', so a press mid-connect is ignored rather than stacking
// dials. We only actuate the car once we're actually online.
const runButtonAction = () => {
  if (tesla.connection.status !== 'online') {
    onRetry()
    return
  }
  runConfiguredButtonAction(store.buttonAction, {
    locked: tesla.locked,
    onLock,
    onUnlock,
    onFrunk,
    onTrunk,
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
  // Walk-away auto-exit: the car locking ITSELF (live push, not our tap) means the
  // user left — close the app back to the watchface. Policy/state in callbacks.js;
  // exit() is guarded for the secondary-widget context, which runs this same file.
  tesla.onChange(exitListener)

  // Passive-entry handshake: HAPTIC-only feedback, no toasts (progress/success is
  // silent per the toasts-on-errors-only rule). A short buzz when the car answers
  // ('status', synced on connect) or accepts the key during walk-up ('authorized').
  // 'authorized' also flips the status label to 'Authorized' (repaint — passive events
  // don't go through onChange), matching the app widget.
  tesla.onPassiveEvent((evt) => {
    if (evt.type === 'status' || evt.type === 'authorized') {
      vibro.medium()
    }
    if (evt.type === 'authorized') {
      authorized = true
      render()
    }
  })

  // Auto-establish the BLE session on open and pull the live car state; once online
  // this also arms the live-push listener so opening a door, etc. repaints the view.
  //
  // Settings sync (vehicle name/VIN + the autoUnlock toggle) is a phone RPC
  // that shares the single BLE radio with the car connection, so defer it until connect
  // settles (first non-'checking' onChange) to avoid radio contention. It persists the
  // toggles into local storage for later reads.
  //
  // Tracked so destroy() can remove it — the secondary widget rebuilds per visit and an
  // untracked listener would accumulate.
  let synced = false
  syncListener = () => {
    if (tesla.connection.status === 'checking') return
    if (!synced) {
      synced = true
      phone.syncSettings()
    }
  }
  tesla.onChange(syncListener)
  // Auto-unlock is the connect PRE-LOAD step: it fires on the virgin connection,
  // before the status read and before passive entry answers anything (the policy —
  // toggle + cached lock state — lives in callbacks.js; tesla only sequences it).
  tesla.beforeInitialLoad(autoUnlock)
  tesla.connect()

  // Physical watch button → the user-chosen car action (settings Select, synced to
  // store.buttonAction). SELECT (crown) and SHORTCUT (the dedicated side button) both
  // fire it; default 'lockUnlock' preserves the original crown behavior.
  safe('onKey', () =>
    onKey({
      callback: (key, keyEvent) => {
        if (keyEvent === KEY_EVENT_CLICK && (key === KEY_SELECT || key === KEY_SHORTCUT)) {
          runButtonAction()
          return true // consume — otherwise SHORTCUT also fires the system shortcut (leaves the app)
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
  tesla.offChange(exitListener)
  if (syncListener) {
    tesla.offChange(syncListener)
    syncListener = null
  }
  // Delete this page's widgets before leaving. setWakeUpRelaunch(true) means
  // exit→reopen doesn't kill the process cleanly, so undeleted widgets linger on
  // the display and stack across relaunches (the next launch's empty widgets[]
  // can't reach them). See page/pairing/index.js onDestroy for the full write-up.
  safe('UI.reset', () => UI.reset())
  safe('keepScreenOn', () => keepScreenOn(false))
  // No app-close auto-lock: VCSEC gives no reliable "occupant in car" signal
  // (userPresence = key detected, always true while we're connected), so closing
  // the app while seated would wrongly lock the car (device 2026-07-16). Tesla's
  // own walk-away lock handles locking with real seat/proximity sensors. Just free
  // the native BLE/session state so the next launch isn't poisoned.
  tesla.shutdown()
}
