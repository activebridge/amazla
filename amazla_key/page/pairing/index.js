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
//   success  paired — "Done" returns to the main page
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
  if (screen === 'success') slide.onClick = () => replace({ url: 'page/index' })
  return slide
}

const render = () => {
  UI.reset()
  Slide(slideFor())
}

const setScreen = (next) => {
  screen = next
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
    onLog: (m) => hmUI.updateStatusBarTitle(m),
    onError: (m) => {
      errorMsg = m
      setScreen('error')
    },
    onSuccess: () => setScreen('success'),
  })
  controller.start()
}

Page({
  build() {
    setWakeUpRelaunch(true)
    setPageBrightTime(300)

    phone = new Phone()
    screen = store.vehicleVin ? 'ready' : 'setup'
    render()
    hmUI.setStatusBarVisible(false)
    keepScreenOn(true)

    // Pull the latest VIN from the phone; flip setup → ready once it lands.
    phone.syncSettings()
    setTimeout(() => {
      if (screen === 'setup' && store.vehicleVin) setScreen('ready')
    }, 1500)
  },

  onDestroy() {
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
