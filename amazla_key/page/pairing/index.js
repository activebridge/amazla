import { setPageBrightTime, setWakeUpRelaunch } from '@zos/display'
import { getText } from '@zos/i18n'
import { replace } from '@zos/router'
import * as hmUI from '@zos/ui'

import UI from './../../../pages/ui.js'
import { keepScreenOn } from './../../../zeppify/index.js'
import Phone from './../../lib/phone.js'
import store from './../../lib/store.js'
import BLE from './../../lib/tesla-ble/index.js'
import { createPairingController } from './../../lib/tesla-ble/pairing.js'
import teslaSession from './../../lib/tesla-ble/session.js'
import { safe } from './../../shared/safe.js'
import { Slide } from './components/slide.js'
import { vibro } from './../../../zeppify/index.js'

// Pairing flow — a single page that renders one Slide per visual state. The
// whole flow lives on one page so the live BLE link, registered RX callbacks and
// the in-flight pairing controller all share one lifecycle (navigating between
// pages mid-pair would orphan callbacks onto destroyed widgets).
//
// Visual states (six storyboard screens). title/button are i18n msgids resolved
// via getText() in slideFor() — strings live in page/i18n/<lang>.po, not here.
//   setup    no VIN yet — enter it in the phone app (no on-watch action)
//   ready    VIN synced — car-side instructions, "Done" advances to pair
//   pair     ready to pair — primary action "Pair" available
//   pairing  scan/connect/pair/verify in progress (no action)
//   nfc      tap key card on the console to authorise (no action)
//   success  paired — "Done" returns to the main page, which starts the Kezel
//            purchase if the app isn't licensed yet (see page/index.js build()).
//   error    failed — "Retry" restarts the flow
const SLIDES = {
  setup: {
    image: 'pairing/01-setup',
    title: 'pairing_setup_title',
  },
  ready: {
    image: 'pairing/02-ready-synced',
    title: 'pairing_car_title',
    button: 'pairing_btn_done',
  },
  pair: {
    image: 'pairing/02-ready-synced',
    title: 'pairing_pair_title',
    button: 'pairing_btn_pair',
  },
  pairing: {
    image: 'pairing/03-pairing',
    title: 'pairing_pairing_title',
  },
  nfc: {
    image: 'pairing/04-nfc-keycard',
    title: 'pairing_nfc_title',
  },
  success: {
    image: 'pairing/05-success',
    title: 'pairing_success_title',
    button: 'pairing_btn_done',
  },
}

var phone = null
var controller = null
var screen = 'setup'
var errorMsg = ''

const slideFor = () => {
  if (screen === 'error') {
    return {
      image: 'pairing/06-error',
      // errorMsg is a diagnostic string from the BLE layer (not localized);
      // fall back to the localized generic message when absent.
      title: errorMsg || getText('pairing_error_title'),
      button: getText('pairing_btn_retry'),
      // Back to the first pairing screen (ready, or setup if no VIN yet) so the
      // user re-reads the instructions and taps Pair again — not an immediate retry.
      onClick: () => {
        errorMsg = ''
        setScreen(store.vehicleVin ? 'ready' : 'setup')
      },
    }
  }
  const base = SLIDES[screen] || SLIDES.setup
  const slide = { image: base.image, title: getText(base.title) }
  if (base.button) slide.button = getText(base.button)
  if (screen === 'ready') slide.onClick = () => setScreen('pair')
  if (screen === 'pair') slide.onClick = startPairing
  // Paired — go to the main app, which starts the Kezel purchase if not yet licensed.
  if (screen === 'success') slide.onClick = () => replace({ url: 'page/index' })
  return slide
}

const render = () => {
  UI.reset()
  Slide(slideFor())
}

const setScreen = (next) => {
  // No-op when the screen isn't actually changing. The controller streams the same
  // state repeatedly (e.g. onState('confirming') on every ~1Hz beacon during the
  // keycard wait), and re-running render() there just churns delete+recreate of the
  // slide's widgets — the async delete/recreate is where the old title survives and
  // ghosts under the new one. Nothing changed ⇒ nothing to repaint (or re-buzz).
  if (next === screen) return
  screen = next
  // Haptic cues on entering a state: one short buzz when the user is asked to tap
  // the key card, a double buzz (notification pattern) when pairing completes.
  if (next === 'nfc') vibro.medium()
  else if (next === 'success') vibro.notification()
  render()
}

function startPairing() {
  // Tear down any prior attempt and reset BLE/session so each pairing run starts
  // from a clean state (no stale connection, callbacks, or session key).
  if (controller) {
    safe('controller.cancel', () => controller.cancel())
    controller = null
  }
  safe('teslaSession.reset', () => teslaSession.reset())
  safe('BLE.reset', () => BLE.reset())

  errorMsg = ''
  setScreen('pairing')
  controller = createPairingController(phone, {
    // confirming = waiting for the key-card tap; everything else upstream of
    // 'done' is the indeterminate "connecting/pairing" screen.
    onState: (s) => setScreen(s === 'confirming' ? 'nfc' : 'pairing'),
    onLog: (m) => console.log('[pairing] ' + m),
    onError: (m) => {
      errorMsg = m
      setScreen('error')
    },
    onSuccess: () => {
      setScreen('success')
      // Mark paired on the phone (settings page "Paired At"). Fire-and-forget: the
      // phone is in range right now (it just did the pair RPCs).
      phone.savePaired(() => {})
      // Fire an unlock so the car chirps/unlocks — a tangible "it works" confirmation
      // that matches the success screen's "Tesla did an unlock sound?" prompt. The
      // session key was just derived on the still-live BLE connection (pairing.js),
      // so this reuses it. Best-effort: a failure doesn't undo a successful pairing.
      safe('pairing.unlockConfirm', () => teslaSession.unlock(() => {}))
    },
  })
  controller.start()
}

Page({
  build() {
    setWakeUpRelaunch(true)
    setPageBrightTime(300)

    // Clean slate. `screen`/`errorMsg`/`controller` are MODULE-level (the page module
    // is a singleton — they persist across every build/onDestroy for the whole app
    // session). A previous visit's controller can still have async work in flight
    // (BLE waitForNextResponse callbacks, deriveSessionKey retry timers, a session
    // timeout). Without this, that stale controller fires a late onError/onSuccess
    // AFTER this fresh build and repaints a "connection timeout"/"paired!" slide over
    // the start slide (device 2026-07-16). Cancelling flips its `cancelled` flag so
    // every in-flight callback no-ops instead of driving the screen.
    if (controller) {
      safe('controller.cancel', () => controller.cancel())
      controller = null
    }
    errorMsg = ''

    phone = new Phone()

    screen = store.vehicleVin ? 'ready' : 'setup'
    render()
    hmUI.setStatusBarVisible(false)
    keepScreenOn(true)

    // Pull the latest VIN from the phone, then re-derive the screen BOTH ways:
    // setup → ready when a VIN landed, but also ready → setup when the phone no
    // longer has one (stale watch VIN after an unpair/VIN removal — the initial
    // guess above came from the watch's own storage, which syncSettings just
    // corrected). Only while still on an instruction screen: once the user
    // advanced to pair/pairing/nfc/…, the sync result must not yank the flow back.
    phone.syncSettings().then(() => {
      if (screen !== 'setup' && screen !== 'ready') return
      const next = store.vehicleVin ? 'ready' : 'setup'
      if (next !== screen) setScreen(next)
    })
  },

  onDestroy() {
    // Delete THIS page's widgets before we go. The app keeps setWakeUpRelaunch(true),
    // so exit→reopen doesn't kill the process cleanly: without this, the slide's
    // native widgets linger on the display, and the next launch is a fresh render
    // context with an empty widgets[] that has no reference to them and can never
    // delete them — so each relaunch stacks another undeleted slide until they
    // visibly overlay (device 2026-07-16: exit/open → stale 'success' slide, then
    // two pages overlaid). Clearing here is the only point that still owns them.
    safe('UI.reset', () => UI.reset())
    // Cancel any in-flight pairing (stops scan + disconnect) and free BLE so the
    // next page doesn't inherit poisoned native state — same teardown as the
    // main page. The session key cached during pairing makes the main page's
    // reconnect fast.
    if (controller) safe('controller.cancel', () => controller.cancel())
    keepScreenOn(false)
    safe('teslaSession.reset', () => teslaSession.reset())
    safe('BLE.reset', () => BLE.reset())
  },
})
