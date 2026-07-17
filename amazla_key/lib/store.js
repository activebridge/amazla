import { readFileSync, rmSync, writeFileSync } from '@zos/fs'
import { LocalStorage } from '@zos/storage'
import { binaryStringToBytes } from './tesla-ble/crypto/binary-utils.js'

const localStorage = new LocalStorage()

// In-memory cache of file-backed values. Each readFileSync costs ~50-130ms on
// the watch, and a single connect reads vehicle_ec_public_key up to 4x and
// session_key 2x (incl. two presence-diag logs) — ~600ms of redundant I/O before
// the fast/slow branch even runs. Cache keyed by file path; coherent because the
// only writers are writeBinary/removeBinary below (no external .dat writes). A
// miss is cached as `undefined` so a not-yet-derived key isn't re-read each access.
const _fileCache = Object.create(null)

const readBinary = (path) => {
  if (path in _fileCache) return _fileCache[path]
  let val
  try {
    const raw = readFileSync({ path: `${path}.dat` })
    val = raw ? new Uint8Array(raw) : undefined
  } catch (_e) {
    val = undefined
  }
  _fileCache[path] = val
  return val
}

const writeBinary = (path, bytes) => {
  if (!bytes) return
  writeFileSync({
    path: `${path}.dat`,
    data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })
  _fileCache[path] = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
}

const get = (name) => {
  try {
    return binaryStringToBytes(localStorage.getItem(name))
  } catch (_e) {
    return null
  }
}

const set = (name, value) => {
  value ? localStorage.setItem(name, value) : localStorage.removeItem(name)
}

const store = {
  // Enrolled watch PUBLIC key (65-byte uncompressed EC point). File-backed for the
  // SAME reason as watchPrivateKey / vehicleEcPublicKey / sessionKey: the point
  // contains null bytes, which LocalStorage corrupts — and a LATER LS write (e.g.
  // vehicleMac during a connect scan) mangles an already-stored null-byte value.
  // That produced the nastiest failure of all: pairing derived + unlocked fine
  // (fresh value still intact), then the very next CONNECT read a corrupted key
  // and the vehicle answered KEY_NOT_ON_WHITELIST for a key that IS enrolled
  // (device 2026-07-16). Falls back to the legacy LocalStorage value once so an
  // already-enrolled watch migrates without re-pairing.
  get watchPublicKey() {
    const fromFile = readBinary('watch_public_key')
    if (fromFile) return fromFile
    const legacy = get('watchPublicKey')
    return legacy && legacy.length ? legacy : null
  },
  set watchPublicKey(value) {
    if (typeof value === 'string') value = binaryStringToBytes(value)
    if (value) writeBinary('watch_public_key', value)
    else this.removeBinary('watch_public_key')
    // File is the single source of truth — drop any stale LocalStorage copy.
    localStorage.removeItem('watchPublicKey')
  },

  // Cached 16-byte ECDH-derived session key. The key is a constant for a paired
  // watch+vehicle (static watchPrivateKey × static vehicle EC pubkey), so it's
  // computed once (at pair time, or first connect after this cache was added)
  // and reused — letting normal connects skip the ~3.8s ECDH scalar-mul. It's a
  // symmetric secret with null bytes, so it lives in a file like the private key.
  // Invalidated together with vehicleEcPublicKey (re-pair / vehicle key change);
  // session.js rebuilds it via the slow path whenever the stored EC pubkey no
  // longer matches the SessionInfo pubkey.
  get sessionKey() {
    return readBinary('session_key')
  },
  set sessionKey(value) {
    if (typeof value === 'string') value = binaryStringToBytes(value)
    if (value) writeBinary('session_key', value)
    else this.removeBinary('session_key')
  },

  // File-backed: the 65-byte vehicle EC point contains null bytes, which don't
  // survive in LocalStorage (same hazard that moved watchPublicKey, watchPrivateKey
  // and sessionKey to files — they read back corrupted). Falls back to the legacy
  // LocalStorage value once so an already-paired watch migrates without re-pairing.
  get vehicleEcPublicKey() {
    const fromFile = readBinary('vehicle_ec_public_key')
    if (fromFile) return fromFile
    const legacy = get('vehicleEcPublicKey')
    return legacy && legacy.length ? legacy : null
  },
  set vehicleEcPublicKey(value) {
    if (value) writeBinary('vehicle_ec_public_key', value)
    else this.removeBinary('vehicle_ec_public_key')
    // File is the single source of truth — drop any stale LocalStorage copy.
    localStorage.removeItem('vehicleEcPublicKey')
  },
  get vehicleMac() {
    return localStorage.getItem('vehicleMac')
  },
  set vehicleMac(value) {
    set('vehicleMac', value)
  },
  // Last-known vehicle state snapshot (flat booleans, JSON — LocalStorage-safe).
  // Rendered immediately on app load: since the key started using domain 3 the
  // car stopped answering GET_STATUS promptly (3s → 20s+ to first push, device
  // captures 2026-06-11), so the UI paints the cached state instantly and live
  // pushes correct any drift.
  get lastVehicleState() {
    const s = localStorage.getItem('lastVehicleState')
    if (!s) return null
    try {
      return JSON.parse(s)
    } catch (_e) {
      return null
    }
  },
  set lastVehicleState(value) {
    if (value) localStorage.setItem('lastVehicleState', JSON.stringify(value))
    else localStorage.removeItem('lastVehicleState')
  },
  get vehicleVin() {
    const s = localStorage.getItem('vehicleVin')
    return s ? binaryStringToBytes(s) : null
  },
  set vehicleVin(value) {
    set('vehicleVin', value)
  },
  // True iff all artifacts required for passive entry are present.
  // Computed — cannot get out of sync after reset or partial writes.
  // Note: vehicleEcPublicKey and the cached sessionKey are NOT required here.
  // They're populated on the first successful CONNECT (from SessionInfo +
  // phone-computed ECDH), not at pair time — pair just enrolls the watch key.
  // Ready to begin pairing: we know which vehicle (VIN synced from the companion).
  // The VIN is required to derive the BLE local name we scan/enroll against.
  get isReady() {
    return !!this.vehicleVin
  },
  // Enrolled = has the enrolled public key + VIN. This is everything the watch
  // needs to ATTEMPT a connect and derive the session key — it gates connects
  // (session.js). The private key lives only on the phone (it does the ECDH); the
  // session key itself is NOT required here: it's produced by the connect this
  // gate allows (deriving it requires connecting), so requiring it would deadlock
  // the bootstrap.
  get isEnrolled() {
    return !!(this.watchPublicKey && this.vehicleVin)
  },
  // Fully paired = enrolled AND the session key is cached, i.e. ready to unlock
  // without the phone. Use for UI/status, NOT as the connect gate.
  get isPaired() {
    return this.isEnrolled && !!this.sessionKey
  },
  get vehicleName() {
    return localStorage.getItem('vehicleName')
  },
  set vehicleName(value) {
    set('vehicleName', value)
  },
  // Derived from the VIN, not stored: char 4 is Tesla's model letter.
  get vehicleModel() {
    const vin = this.vehicleVin
    if (!vin || vin.length < 4) return null
    const MODELS = { S: 'Model S', 3: 'Model 3', X: 'Model X', Y: 'Model Y', C: 'Cybertruck', R: 'Roadster' }
    return MODELS[String.fromCharCode(vin[3])] || null
  },

  // Auto-unlock pref synced from the phone (GET_SETTINGS). Stored as '1'/'0';
  // never-synced (null) = OFF (opt-in; auto-unlock historically raced passive entry).
  get autoUnlock() {
    return localStorage.getItem('autoUnlock') === '1'
  },
  set autoUnlock(value) {
    set('autoUnlock', value ? '1' : '0')
  },
  // Physical-button action (settings Select, synced via GET_SETTINGS). One of
  // 'lockUnlock' (default) | 'frunk' | 'trunk' — what a watch key press triggers
  // while the main page is open (see page/main.js onKey).
  get buttonAction() {
    return localStorage.getItem('buttonAction') || 'lockUnlock'
  },
  set buttonAction(value) {
    set('buttonAction', value || 'lockUnlock')
  },
  // KiezelPay license, sticky. Set the first time kpay reports 'licensed' and read
  // as the fallback whenever kpay can't answer — kpay lives on the app instance
  // (null after an aborted onCreate; possibly absent in the widget runtime) and its
  // KPAY_STATUS cache sits on the kpay lib's OWN LocalStorage instance (clobber-
  // prone, see connectId below). A paid driver must never be locked out of the car
  // by licensing plumbing. Deliberately NOT cleared by reset(): the license is
  // per-app, not per-vehicle.
  get licensed() {
    return localStorage.getItem('licensed') === '1'
  },
  set licensed(value) {
    set('licensed', value ? '1' : null)
  },

  // Last successful native BLE connect_id — persisted so the NEXT launch can
  // mstDisconnect a stuck connection even after a crash (no onDestroy). This lives
  // here, on the SINGLE store LocalStorage instance, NOT in a second `new
  // LocalStorage()` in ble.js: each @zos/storage instance keeps its own in-memory
  // snapshot and writes the WHOLE thing back on flush, so two instances silently
  // clobber each other's keys — ble.js persisting connect_id on every connect was
  // wiping store's autoUnlock / lastVehicleState writes (device 2026-07-16).
  get connectId() {
    const raw = localStorage.getItem('lastBleConnectId')
    if (!raw) return null
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
  },
  set connectId(id) {
    if (id === null || id === undefined) localStorage.removeItem('lastBleConnectId')
    else localStorage.setItem('lastBleConnectId', String(id))
  },

  // Anti-replay counter high-water, persisted across launches per epoch. The vehicle
  // rejects (silently drops) any signed message whose counter isn't strictly above the
  // last it accepted for the current epoch. The car's SessionInfo reports a counter on
  // each connect, but on a fast reconnect it can LAG the value we actually pushed in the
  // previous session (unlock + wake + passive-entry replies each burn one), so seeding
  // from it alone replays counters the car already saw → the command is dropped with no
  // fault. The Tesla SDK avoids this by never lowering its counter (max of local vs
  // vehicle) and persisting it across process restarts (Export/ImportSessionInfo). We
  // have no in-process continuity (each launch is a fresh process), so we persist it
  // here. Stored as JSON {epoch: hex, counter: N} — LocalStorage-safe (no null bytes).
  // Cleared on unpair (reset) since a new pairing brings a new session entirely.
  get counterState() {
    const s = localStorage.getItem('counterState')
    if (!s) return null
    try {
      return JSON.parse(s)
    } catch (_e) {
      return null
    }
  },
  set counterState(v) {
    if (v && typeof v.counter === 'number' && v.epoch) localStorage.setItem('counterState', JSON.stringify(v))
    else localStorage.removeItem('counterState')
  },
  // Adapter for the session's injected counter-persistence hook (session.counterStore,
  // see lib/tesla-ble/session.js). Storage is THIS module's job, so the load/save
  // mapping lives here — the session and the facade stay storage-agnostic and just move
  // this opaque interface. load returns the high-water only for a MATCHING epoch (a
  // different epoch = the car reset its counter space → no floor to honor).
  counterStore: {
    load(epochHex) {
      const s = store.counterState
      return s && s.epoch === epochHex ? s.counter : null
    },
    save(epochHex, counter) {
      store.counterState = { epoch: epochHex, counter }
    },
  },

  removeBinary: (key) => {
    _fileCache[key] = undefined // keep the read cache coherent with the file
    try {
      rmSync({ path: `${key}.dat` })
    } catch (_e) {
      // ignore
    }
  },

  removeItem: (key) => {
    localStorage.removeItem(key)
  },

  reset() {
    localStorage.removeItem('vehicleName')
    localStorage.removeItem('vehicleVin')
    localStorage.removeItem('vehicleMac')
    localStorage.removeItem('lastVehicleState')
    localStorage.removeItem('vehicleEcPublicKey')
    localStorage.removeItem('watchPublicKey')
    this.removeBinary('watch_public_key')
    this.removeBinary('vehicle_ec_public_key')
    this.removeBinary('session_key')
    localStorage.removeItem('counterState')
  },
}

export default store
