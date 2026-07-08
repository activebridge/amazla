/**
 * Session test harness helpers.
 *
 * Wires up store + BLEHarness + CarSimulator for tests that exercise session.js.
 * Produces a real P-256 doublings table so ECDH + HMAC execute against genuine
 * crypto — only the transport (@zos/ble) and storage (@zos/fs) are stubbed.
 */

import { createECDH } from 'crypto'
import store from '../../lib/store.js'
import teslaBLE from '../../lib/tesla-ble/ble.js'
import { computeTeslaBLEName } from '../../lib/tesla-ble/ble-name.js'
import { bleHarness, _fsStore } from '../../__mocks__/zos.js'
import { CarSimulator } from './car-simulator.js'
import { bytesToBinaryString, binaryStringToBytes } from '../../app-side/ble-crypto.js'
import Phone from '../../lib/phone.js'

// Stub Phone.computeSharedSecret: the phone derives the ECDH shared secret from
// its private key + the SessionInfo vehicle pubkey. The watch never holds the
// private key, so the fixture stashes it phone-side (_phonePrivateKey) — session.js
// gets a genuine secret (→ real sessionKey) without a working messageBuilder.
// Node's native ECDH, NOT bleCrypto.computeSharedSecret: the production BigInt
// implementation costs seconds per call (affine double-and-add) and dominated the
// test-run time. Identical output (32-byte X); bleCrypto's math is covered by
// ble-crypto.test.js. Tests that simulate phone unavailability override per-case.
let _phonePrivateKey = null
Phone.prototype.computeSharedSecret = function (vehiclePubBytes) {
  try {
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(Buffer.from(binaryStringToBytes(_phonePrivateKey)))
    const secret = ecdh.computeSecret(Buffer.from(vehiclePubBytes))
    return Promise.resolve(new Uint8Array(secret))
  } catch (e) {
    return Promise.reject(e)
  }
}

/** Wrap a callback-style function as a Promise */
export const p = (fn) => new Promise((resolve) => fn(resolve))

/** Left-pad a big-endian scalar buffer to a fixed 32 bytes (value-preserving). */
export const pad32 = (buf) => {
  const src = new Uint8Array(buf)
  if (src.length === 32) return src
  const out = new Uint8Array(32)
  out.set(src, 32 - src.length)
  return out
}

/** Populate all store fields required for session establishment */
export const setupStore = (sim) => {
  store.vehicleMac         = 'AA:BB:CC:DD:EE:FF'
  store.vehicleEcPublicKey = sim.vehiclePubKey
  store.vehicleVin         = bytesToBinaryString(sim.vin)
  // Tesla protocol: one long-term keypair for both SessionInfoRequest identity
  // and ECDH. Generate a real P-256 keypair, store the PUBLIC half on the watch,
  // keep the private half phone-side (for the ECDH stub), and register the pubkey
  // with the simulator's whitelist.
  const watchEcdh = createECDH('prime256v1')
  watchEcdh.generateKeys()
  // Node returns the scalar as a *minimal* big-endian buffer, so ~0.4% of keys
  // are <32 bytes (leading zero). Left-pad to a fixed 32 bytes (value-preserving)
  // — otherwise the phone-side ECDH rejects it ~1 run in 5.
  const watchPriv = pad32(watchEcdh.getPrivateKey())
  const watchPub = new Uint8Array(watchEcdh.getPublicKey())
  store.watchPublicKey = bytesToBinaryString(watchPub)
  _phonePrivateKey = bytesToBinaryString(watchPriv) // phone holds the private key, not the watch
  sim._enrolledPublicKey = watchPub
  // No cached sessionKey is seeded — the first establish exercises the slow path
  // (phone computeSharedSecret → derive → cache), mirroring a fresh pairing.
  // Production session.js scans by VIN-derived local name (Tesla rotates the
  // BLE MAC every ~15 min). Make the harness surface a matching beacon so the
  // scan resolves immediately instead of waiting out the scan duration.
  bleHarness.setScanAutoEmit({
    name: computeTeslaBLEName(store.vehicleVin),
    mac: 'AA:BB:CC:DD:EE:FF',
  })
}

/** Clear persisted FS-backed state (doublings table, EC key, etc.) */
export const clearFsStore = () => {
  Object.keys(_fsStore).forEach((k) => delete _fsStore[k])
}

/** Fresh simulator + harness + store; returns { sim } */
export const bootSessionEnv = () => {
  clearFsStore()
  store.reset()
  const sim = new CarSimulator()
  bleHarness.reset()
  bleHarness.setSimulator(sim)
  teslaBLE.reset()
  teslaBLE.chunkIntervalMs = 0 // pacing-agnostic: don't couple test timing to prod chunk delay
  setupStore(sim)
  return { sim }
}
