// UI-only mock of the Tesla backend, used to develop the page in the simulator
// without the heavy BLE/crypto lib (which OOMs the SIM). Mirrors the surface the
// page touches: the `tesla` facade + a `Phone`. Toggle it in page/index.js by
// swapping which backend block is imported — see the comment there.
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
  charge: { level: 72, range: 210, limit: 80, minsToFull: 135, state: 'Charging', ts: Math.floor(Date.now() / 1000) },
  get primaryState() {
    if (this.sleeping) return 'asleep'
    const s = this.charge && this.charge.state
    if (s === 'Charging' || s === 'Starting') return 'charging'
    if (s === 'Complete') return 'charged'
    return 'parked'
  },
  get pluggedIn() {
    const s = this.charge && this.charge.state
    return !!s && s !== 'Disconnected' && s !== 'Unknown'
  },
  startCharge: (cb) => cb && cb({ success: true }),
  stopCharge: (cb) => cb && cb({ success: true }),
  // Starts 'checking' and flips to 'online' ~2.5s after connect(), so the
  // Connecting… state is visible in the SIM (widget status line, page spinner).
  connection: { status: 'checking', error: null },
  isPaired: true,
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
  chargePort: (cb) => cb && cb({ success: true }),
  fetchChargeState: (cb) => cb && cb({ success: true }),
}

export function Phone() {
  this.syncSettings = noop
  this.reset = noop
}
