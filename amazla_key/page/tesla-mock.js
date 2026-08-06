// UI-only mock of the Tesla backend, used to develop the page in the simulator
// without the heavy BLE/crypto lib (which OOMs the SIM). Mirrors the surface the
// page touches: the `tesla` facade + a `Phone`, plus the pairing-flow surface
// (store / BLE / teslaSession / createPairingController) at the bottom. Toggle it
// in page/main.js and page/pairing/index.js by swapping which backend block is
// imported — see the comments there.
const noop = () => {}

export const tesla = {
  locked: false,
  df: true, // front driver door
  dr: false,
  pf: false,
  pr: false,
  trunkOpen: false,
  frunkOpen: true,
  chargePortOpen: false,
  sleeping: false,
  userPresent: false,
  // Starts 'checking' and flips to 'online' ~2.5s after connect(), so the
  // Connecting… state is visible in the SIM (widget status line, page spinner).
  connection: { status: 'checking', error: null },
  // false → page/main.js build() routes straight to page/pairing/index (that is
  // what makes the pairing storyboard reachable in the SIM). Set true to land on
  // the main page instead.
  isPaired: false,
  _listeners: [],
  onChange(fn) {
    this._listeners.push(fn)
  },
  offChange(fn) {
    this._listeners = this._listeners.filter((l) => l !== fn)
  },
  _notify() {
    this._listeners.forEach((fn) => fn())
  },
  onPassiveEvent: noop,
  busy: false,
  // Real facade runs the auto-unlock hook before the first status render.
  beforeInitialLoad: (done) => done && done(),
  connect() {
    this.connection.status = 'checking'
    this._notify()
    setTimeout(() => {
      this.connection.status = 'online'
      this._notify()
    }, 2500)
  },
  shutdown: noop,
  reset: noop,
  lock(cb) {
    this.locked = true
    this._notify()
    cb && cb({ success: true })
  },
  unlock(cb) {
    this.locked = false
    this._notify()
    cb && cb({ success: true })
  },
  trunk: (cb) => cb && cb({ success: true }),
  frunk: (cb) => cb && cb({ success: true }),
}

// page/callbacks.js imports lib/tesla.js, which drags the whole BLE + crypto lib
// into the bundle and OOMs the SIM even when `tesla` here is the one being used.
// main.js swaps these four in alongside the tesla/Phone swap.
export const autoUnlock = (done) => done && done()
export const noteSelfLock = noop
export const clearSelfLock = noop
export const autoExitOnLock = noop

export function Phone() {
  // The pairing page does phone.syncSettings().then(...), so this must be thenable.
  this.syncSettings = () => Promise.resolve()
  this.savePaired = (cb) => cb && cb()
  this.reset = noop
}

// ─── Pairing flow (page/pairing/index.js) ───────────────────────────────────
// Enough surface to walk the storyboard in the SIM: a VIN so the flow starts on
// 'ready' rather than the dead-end 'setup' slide, no-op BLE/session teardown, and
// a controller that plays the states on a timer.

export const store = {
  vehicleVin: '5YJ3E1EA7KF000000',
}

export const BLE = {
  reset: noop,
  disconnect: noop,
}

export const teslaSession = {
  reset: noop,
}

// The FIRST pairing attempt fails, so one run walks the whole storyboard including
// the error slide and its Retry: pair → pairing → error → Retry → ready → pair →
// pairing → nfc → success. Set to false to go straight through, or to Infinity to
// stay on the failure path.
const FAIL_ATTEMPTS = 1
// Beat between storyboard states, ms.
const STEP = 3000

let attempt = 0

export const createPairingController = (_phone, { onState, onLog, onError, onSuccess }) => {
  let cancelled = false
  const timers = []
  // The real controller streams the same state repeatedly (~1 Hz beacons while it
  // waits for the key card); replay that so setScreen's no-op guard is exercised.
  const at = (ms, fn) => {
    timers.push(
      setTimeout(() => {
        if (!cancelled) fn()
      }, ms),
    )
  }
  return {
    start() {
      attempt += 1
      onLog('mock: scanning (attempt ' + attempt + ')')
      at(0, () => onState('connecting'))
      at(STEP, () => onState('pairing'))
      if (attempt <= FAIL_ATTEMPTS) {
        at(STEP * 2, () => onError('could not connect to the vehicle'))
        return
      }
      at(STEP * 2, () => onState('confirming'))
      at(STEP * 2 + 900, () => onState('confirming'))
      at(STEP * 2 + 1800, () => onState('confirming'))
      at(STEP * 3, () => {
        // Mirror the real flow: once paired, "Done" on the success slide must land
        // on the main page instead of bouncing straight back into pairing.
        tesla.isPaired = true
        onSuccess()
      })
    },
    cancel() {
      cancelled = true
      timers.forEach((t) => {
        clearTimeout(t)
      })
    },
  }
}
