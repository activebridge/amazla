import '../shared/device-polyfill'
import { prop, anim_status } from '@zos/ui'
import { text, img, button, animation, width, getAppWidgetSize, setAppWidgetSize } from '../../pages/ui.js'
import { safe } from '../shared/safe.js'
import { keepScreenOn, vibro } from '../../zeppify/index.js'
// REAL (device): the BLE + crypto lib. MOCK (simulator — real lib OOMs the SIM):
// swap the imports, same toggle as page/main.js.
import tesla from '../lib/tesla.js'
// import { tesla } from '../page/tesla-mock.js'

// App widget (widget-list card): a Tesla key card — matte black rounded card
// with the silver wordmark, styled after the NFC key card, plus a lock-state
// icon and one status line. ONE action: tapping the card locks/unlocks based on
// the current state (icon + label repaint optimistically via tesla.onChange).
// No navigation. While the card is on screen it IS the key: onResume
// establishes the BLE session (same tesla facade as the app), the passive-entry
// responder answers the car's beacons, and onPause/onDestroy tears the session
// down cleanly (toggle-gated auto-lock + native BLE flush) so the next context
// — app, secondary widget, or this card again — doesn't inherit poisoned native
// connect state.
//
// Widget context is NOT the page: no i18n bundle (plain strings here), no phone
// settings sync (needs app.js messageBuilder), no toasts. Status text repaints
// through the same tesla.onChange the app uses, so live pushes (walk-up unlock,
// door open) flip the label in place.

let CARD_W = width
let CARD_H = 0
let margin = 0
let statusText = null
let stateIcon = null
let ICON = null // geometry passed on every src swap — .set() re-centers without it
let running = false

// KPAY license lives on the app instance (app.js globalData). In the widget
// runtime getApp() may be absent/uninitialized — treat that as unlicensed
// (never key the car for free), same policy as page/main.js.
const isLicensed = () => {
  try {
    const app = getApp()
    const kpay = app && app._options && app._options.globalData && app._options.globalData.kpay
    return kpay ? kpay.isLicensed() : false
  } catch (_e) {
    return false
  }
}

// Same state mapping as page/main.js statusKey(), extended with the two
// terminal no-BLE states.
const statusKey = () => {
  if (!tesla.isPaired) return 'unpaired'
  if (!isLicensed()) return 'unlicensed'
  if (tesla.connection.status === 'online') return 'online'
  if (tesla.connection.status === 'checking') return 'checking'
  return tesla.connection.error ? 'failed' : 'offline'
}

// The status line shows the CONNECTION state only (the padlock icon carries the
// car's lock state). 'Authorized' is the passive-entry milestone — the car
// accepted our key during walk-up — sticky while the connection stays online.
// Tesla semantic palette: green = success, red = failure, orange = warning,
// blue = in-progress, white = init.
const LABELS = {
  unpaired: { text: 'Open app to pair', color: 0xffffff },
  unlicensed: { text: 'Unlicensed', color: 0xff9900 },
  checking: { text: 'Connecting', color: 0x3e6ae1 },
  offline: { text: 'Offline', color: 0xff6666 },
  failed: { text: 'Failed', color: 0xff6666 },
}

// Connecting animation: the main app's 12-dot spinner (same art, 64px frame set
// in assets/*/connecting64), shown in the padlock slot while checking. Created
// once in build(); paint() toggles visibility.
let spinner = null

let authorized = false
tesla.onPassiveEvent((evt) => {
  if (evt.type === 'authorized') {
    authorized = true
    paint()
  }
})

const paint = () => {
  if (!statusText) return
  const key = statusKey()
  const online = key === 'online'
  if (!online) authorized = false
  // Command in flight (tesla.busy): a tap-to-lock/unlock can take several seconds
  // (ack wait, timeout+retry, wake). Show the spinner in the padlock slot + a blue
  // "Working…" line so the card doesn't read as frozen between tap and result.
  const busy = online && tesla.busy
  const s = busy
    ? { text: 'Working…', color: 0x3e6ae1 }
    : online
      ? { text: authorized ? 'Authorized' : 'Connected', color: 0x00ef33 }
      : LABELS[key]
  statusText.light.set({ text: s.text })
  statusText.dark.set({ text: s.text })
  statusText.main.set({ text: s.text, color: s.color })
  if (spinner) spinner.setProperty(prop.VISIBLE, key === 'checking' || busy)
  if (stateIcon) {
    // State icons (assets named by the ACTION-page convention): closed padlock =
    // buttons/unlock.png, open padlock = buttons/lock.png — same as pages/styles.js.
    // Hidden while busy so the spinner owns the padlock slot.
    stateIcon.setProperty(prop.VISIBLE, online && !busy)
    if (online && !busy) stateIcon.set({ src: tesla.locked ? 'buttons/unlock.png' : 'buttons/lock.png', ...ICON, centered: false })
  }
}

// No-state card: outside focus the card shows NOTHING but the wordmark — no
// label, no icon, no spinner. onResume paints the live state, onPause/onDestroy
// clears back to blank.
const clear = () => {
  if (flashTimer) {
    clearTimeout(flashTimer)
    flashTimer = null
  }
  if (!statusText) return
  statusText.light.set({ text: '' })
  statusText.dark.set({ text: '' })
  statusText.main.set({ text: '' })
  spinner && spinner.setProperty(prop.VISIBLE, false)
  stateIcon && stateIcon.setProperty(prop.VISIBLE, false)
}

// The one widget action: tap toggles lock/unlock from the current state. On a
// dead link (offline/failed — e.g. the car dropped the connection behind our
// back) a tap RECONNECTS instead, so the card recovers without leaving the
// widget. Repaint rides tesla.onChange (optimistic state flip in the facade);
// no toasts in the widget runtime — haptic ack on success instead.
const onTap = () => {
  const key = statusKey()
  if (key === 'offline' || key === 'failed') {
    tesla.connect() // paint() flips to the Connecting spinner via tesla.onChange
    return
  }
  if (key !== 'online') return
  const done = (r) => {
    if (r && r.success) {
      safe('vibro', () => vibro.medium())
      return
    }
    if (r && r.error === 'Busy') return // command already in flight — not a failure
    // Failure feedback (device 2026-07-13: refusals/timeouts were fully silent and
    // read as "widget broken"): double-buzz + flash a SHORT reason on the status
    // line, then repaint the live state. Facade errors are toast-length — map to
    // card-length.
    safe('vibro', () => vibro.double())
    flashError(r && r.error)
  }
  tesla.locked ? tesla.unlock(done) : tesla.lock(done)
}

// Show a short failure reason in the status line for a beat, then hand the line
// back to paint(). A newer flash or a state repaint after the timer wins — the
// timer just repaints, it never restores captured text.
let flashTimer = null
const flashError = (error) => {
  if (!statusText) return
  const msg = error && error.indexOf('door open') !== -1 ? 'Door open'
    : error && error.indexOf('timed out') !== -1 ? 'No response'
    : 'Failed'
  statusText.light.set({ text: msg })
  statusText.dark.set({ text: msg })
  statusText.main.set({ text: msg, color: 0xff9900 })
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    flashTimer = null
    paint()
  }, 2500)
}

AppWidget({
  build() {
    // Slot geometry is only available here, not at module eval (see
    // authenticator/app-widget). sz.h is unstable on some devices, so the card
    // height derives from the width (squat key-card aspect) and we request it.
    const sz = getAppWidgetSize() || {}
    CARD_W = sz.w || (width - 40)
    margin = sz.margin || ((width - CARD_W) / 2 | 0)
    CARD_H = (CARD_W * 0.45) | 0
    setAppWidgetSize({ h: CARD_H })

    // Matte charcoal key card: card_bg.png is a wide 480×1 HORIZONTAL gradient strip
    // (subtle left→right shade). The widget DOWNSCALES the 480-wide gradient axis to the
    // card width (smooth averaging → no bands) and stretches the flat vertical axis
    // harmlessly. Every gray level kept in the palette (no octree collapse — that was the
    // banding cause). Tiny (~0.3KB), low decode RAM. Opaque, sharp corners (a 1D strip
    // can't carry rounded/transparent corners). Regenerate via the PIL script in git history.
    img({ src: 'card_bg.png', x: margin, y: 0, w: CARD_W, h: CARD_H, centered: false })

    // Silver TESLA wordmark (assets/*/tesla_logo.png, 600×79) — centered, upper
    // third, like the physical card.
    const LOGO_W = (CARD_W * 0.56) | 0
    const LOGO_H = (LOGO_W * 79 / 600) | 0
    img({
      src: 'tesla_logo.png',
      x: margin + ((CARD_W - LOGO_W) / 2 | 0), y: (CARD_H * 0.32 - LOGO_H / 2) | 0,
      w: LOGO_W, h: LOGO_H,
      centered: false,
    })

    // Bottom row: lock-state icon in the left corner (like a card chip), status
    // text centered on the same midline (inset both sides by the icon zone so
    // the label stays truly centered). Icon assets are 110×100.
    const pad = (CARD_H * 0.07) | 0
    const ICON_H = (CARD_H * 0.32) | 0
    const ICON_W = (ICON_H * 110 / 100) | 0
    ICON = {
      x: margin + pad, y: CARD_H - ICON_H - pad,
      w: ICON_W, h: ICON_H,
    }
    stateIcon = img({ src: 'buttons/unlock.png', ...ICON, centered: false })

    // Status text: 3 layers for the same engraved look as the authenticator
    // widget's digits — light top-left shadow, black bottom-right shadow, colored
    // main on top. paint() sets the text on all three, the color on main only.
    const sideInset = ICON_W + pad * 2
    const statusSize = Math.min((CARD_H * 0.19) | 0, 34)
    const sx = margin + sideInset
    const sy = ICON.y
    const box = { w: CARD_W - sideInset * 2, h: ICON_H, text_size: statusSize, text: '', centered: false }
    statusText = {
      light: text({ x: sx - 1, y: sy - 1, color: 0xc0c0c0, ...box }),
      dark: text({ x: sx + 2, y: sy + 3, color: 0x000000, ...box }),
      main: text({ x: sx, y: sy, color: 0x999999, ...box }),
    }

    // Spinner in the padlock slot while connecting (IMG_ANIM is top-left anchored
    // and draws frames at native size — hence the dedicated 64px frame set).
    spinner = animation({
      anim_path: 'connecting64',
      anim_prefix: 'connecting',
      anim_ext: 'png',
      anim_fps: 12,
      anim_size: 12,
      repeat_count: 0,
      anim_status: anim_status.START,
      x: ICON.x + ((ICON_W - 64) / 2 | 0), y: ICON.y + ((ICON_H - 64) / 2 | 0),
      w: 64, h: 64,
      centered: false,
    })

    // Tap target = a BUTTON over the whole card. The hit area is the w/h box; the
    // images are NOT stretched to it: buttons/card.png intentionally doesn't
    // exist (invisible normal state — same trick as the app's src:'press'
    // buttons), buttons/_card.png is a card-sized dark rounded flash rendered at
    // its natural size, centered in the box.
    // Hit box spans the FULL widget slot (not just the card) so no tap misses.
    button({
      x: 0, y: 0, w: width, h: CARD_H,
      src: 'card',
      centered: false,
      click_func: onTap,
    })
    clear() // stateless until focused — onResume paints the live state
  },

  onResume() {
    this.start()
  },

  onPause() {
    this.stop()
  },

  onDestroy() {
    this.stop()
  },

  start() {
    if (running) return
    // Terminal no-BLE states: paint the label, never touch the radio.
    if (!tesla.isPaired || !isLicensed()) {
      paint()
      return
    }
    running = true
    tesla.onChange(paint)
    tesla.connect()
    safe('keepScreenOn', () => keepScreenOn(true))
    paint()
  },

  stop() {
    clear() // leaving the widget — back to the stateless card
    if (!running) return
    running = false
    tesla.offChange(paint)
    safe('keepScreenOn', () => keepScreenOn(false))
    // No app-close auto-lock (no reliable occupant signal — see page/main.js destroy).
    // Tesla's own walk-away lock handles it. Just flush session + native BLE.
    tesla.shutdown()
  },
})
