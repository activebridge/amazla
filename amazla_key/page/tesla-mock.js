// UI-only mock of the Tesla backend, used to develop the page in the simulator
// without the heavy BLE/crypto lib (which OOMs the SIM). Mirrors the surface the
// page touches: tesla state + actions, Phone, BLE, teslaSession. Toggle it in
// page/index.js by swapping which backend block is imported — see the comment there.
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
  connection: { status: 'online', error: null },
  isPaired: true,
  onChange: noop,
  offChange: noop,
  connect: noop,
  retry: noop,
  lock: (cb) => cb && cb({ success: true }),
  unlock: (cb) => cb && cb({ success: true }),
  trunk: (cb) => cb && cb({ success: true }),
  frunk: (cb) => cb && cb({ success: true }),
  chargePort: (cb) => cb && cb({ success: true }),
  fetchChargeState: (cb) => cb && cb({ success: true }),
  lockOnClose: noop,
}

export function Phone() {
  this.syncSettings = noop
}
export const BLE = { reset: noop }
export const teslaSession = { reset: noop }
