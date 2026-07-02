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
  get watchPublicKey() {
    return get('watchPublicKey')
  },

  set watchPublicKey(value) {
    set('watchPublicKey', value)
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
  // survive in LocalStorage (same hazard that moved watchPrivateKey to a file —
  // it read back null on the next launch, so the doublings-table staleness check
  // failed and the watch rebuilt the table via the phone every session instead of
  // running standalone). Falls back to the legacy LocalStorage value once so an
  // already-paired watch migrates without re-pairing.
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
  // Infotainment (domain 3) runs on a different ECU with its OWN EC key pair —
  // its SessionInfo pubkey is not the VCSEC one, so it needs its own ECDH-derived
  // 16-byte key (sha1(watchPriv × infotainmentPub)[:16]). Cached like sessionKey:
  // derived once via the phone, then reused; invalidated when the stored pubkey
  // stops matching the live d3 SessionInfo pubkey.
  get infotainmentSessionKey() {
    return readBinary('inf_session_key')
  },
  set infotainmentSessionKey(value) {
    if (typeof value === 'string') value = binaryStringToBytes(value)
    if (value) writeBinary('inf_session_key', value)
    else this.removeBinary('inf_session_key')
  },
  get infotainmentEcPublicKey() {
    return readBinary('inf_ec_public_key')
  },
  set infotainmentEcPublicKey(value) {
    if (value) writeBinary('inf_ec_public_key', value)
    else this.removeBinary('inf_ec_public_key')
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
  get vehicleModel() {
    return localStorage.getItem('vehicleModel')
  },
  set vehicleModel(value) {
    set('vehicleModel', value)
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
    localStorage.removeItem('vehicleModel')
    localStorage.removeItem('vehicleVin')
    localStorage.removeItem('vehicleMac')
    localStorage.removeItem('lastVehicleState')
    localStorage.removeItem('vehicleEcPublicKey')
    localStorage.removeItem('watchPublicKey')
    // Legacy: clear artifacts left by older builds — the doublings table and the
    // watch-side private key (the watch no longer stores either).
    localStorage.removeItem('hasDoublingsTable')
    this.removeBinary('vehicle_doublings_table')
    this.removeBinary('watch_private_key')
    this.removeBinary('vehicle_ec_public_key')
    this.removeBinary('session_key')
    this.removeBinary('inf_ec_public_key')
    this.removeBinary('inf_session_key')
  },
}

export default store
