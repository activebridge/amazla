import { readFileSync, rmSync, writeFileSync } from '@zos/fs'
import { LocalStorage } from '@zos/storage'
import { binaryStringToBytes } from './tesla-ble/crypto/binary-utils.js'

const localStorage = new LocalStorage()

const readBinary = (path) => {
  try {
    const raw = readFileSync({ path: `${path}.dat` })
    if (raw) return new Uint8Array(raw)
    return undefined
  } catch (_e) {
    return undefined
  }
}

const writeBinary = (path, bytes) => {
  bytes &&
    writeFileSync({
      path: `${path}.dat`,
      data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    })
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

  // Long-term enrolled private key. Tesla protocol uses ONE keypair for both
  // SessionInfoRequest identity AND ECDH (mirrors vehicle-command Go SDK
  // `Session.localKey`). Stored as a file: persisting it as a binary string in
  // LocalStorage corrupted later LS writes (vehicleEcPublicKey + the
  // hasDoublingsTable flag went null on next launch) — null bytes in the
  // 32-byte key break LS persistence of entries set after it.
  get watchPrivateKey() {
    return readBinary('watch_private_key')
  },

  set watchPrivateKey(value) {
    if (typeof value === 'string') value = binaryStringToBytes(value)
    if (value) writeBinary('watch_private_key', value)
    else this.removeBinary('watch_private_key')
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
  get vehicleMac() {
    return localStorage.getItem('vehicleMac')
  },
  set vehicleMac(value) {
    set('vehicleMac', value)
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
  // Enrolled = has the long-term keypair (both halves) + VIN. This is everything
  // needed to ATTEMPT a connect and derive the session key — it gates connects
  // (session.js). The session key itself is NOT required here: it's produced by
  // the connect this gate allows (deriving it requires connecting), so requiring
  // it would deadlock the bootstrap.
  get isEnrolled() {
    return !!(this.watchPublicKey && this.watchPrivateKey && this.vehicleVin)
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
    try {
      rmSync({ path: `${key}.dat` })
    } catch (_e) {
      // ignore
    }
  },

  removeItem: (key) => {
    localStorage.removeItem(key)
  },

  // Storage diagnostics: print byte counts for each persisted artifact.
  // Reveals truncation (null-byte storage issues), missing files, and
  // flag-vs-file mismatches in one pass. Call from BLE page on launch.
  diag() {
    const lsLen = (k) => {
      try {
        const s = localStorage.getItem(k)
        return s == null ? 'null' : `len=${s.length}`
      } catch (_e) {
        return 'err'
      }
    }
    const fileSize = (path) => {
      try {
        const raw = readFileSync({ path })
        return raw ? raw.byteLength : 'null'
      } catch (_e) {
        return 'err'
      }
    }
    console.log(`[STORE.diag] watchPublicKey:      ${lsLen('watchPublicKey')}`)
    console.log(`[STORE.diag] watchPrivateKey:     ${lsLen('watchPrivateKey')}`)
    console.log(
      `[STORE.diag] vehicle_ec_public_key.dat: ${fileSize('vehicle_ec_public_key.dat')} (legacy LS: ${lsLen('vehicleEcPublicKey')})`,
    )
    console.log(`[STORE.diag] session_key.dat:     ${fileSize('session_key.dat')}`)
    console.log(`[STORE.diag] vehicleVin:          ${lsLen('vehicleVin')}`)
    console.log(`[STORE.diag] vehicleMac:          ${lsLen('vehicleMac')}`)
  },

  reset() {
    localStorage.removeItem('vehicleName')
    localStorage.removeItem('vehicleModel')
    localStorage.removeItem('vehicleVin')
    localStorage.removeItem('vehicleMac')
    localStorage.removeItem('vehicleEcPublicKey')
    localStorage.removeItem('watchPublicKey')
    // Legacy: clear any doublings-table artifacts left by older builds.
    localStorage.removeItem('hasDoublingsTable')
    this.removeBinary('vehicle_doublings_table')
    this.removeBinary('watch_private_key')
    this.removeBinary('vehicle_ec_public_key')
    this.removeBinary('session_key')
  },
}

export default store
