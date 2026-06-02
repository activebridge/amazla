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
import bleCrypto, { bytesToBinaryString } from '../../app-side/ble-crypto.js'
import Phone from '../../lib/phone.js'

// Stub Phone.precomputeTable: rebuild path now needs phone-side BigInt
// scalar-mul. In tests we run the same bleCrypto.buildDoublingsTable that the
// companion would, so session.js gets a real 16384-byte table without
// requiring a working messageBuilder. Tests that want to simulate phone
// unavailability override this per-case.
Phone.prototype.precomputeTable = function (vehiclePubBytes) {
  const r = bleCrypto.buildDoublingsTable(bytesToBinaryString(vehiclePubBytes))
  if (!r.success) return Promise.reject(new Error(r.error))
  return Promise.resolve(new Uint8Array(r.buffer))
}

/** Wrap a callback-style function as a Promise */
export const p = (fn) => new Promise((resolve) => fn(resolve))

/** Build doublings table from sim.vehiclePubKey and store it */
export const storeDoublingsTable = (sim) => {
  const result = bleCrypto.buildDoublingsTable(bytesToBinaryString(sim.vehiclePubKey))
  if (!result.success) throw new Error('buildDoublingsTable failed: ' + result.error)
  store.vehicleDoublingsTable = new Uint8Array(result.buffer)
}

/** Populate all store fields required for session establishment */
export const setupStore = (sim) => {
  store.vehicleMac         = 'AA:BB:CC:DD:EE:FF'
  store.vehicleEcPublicKey = sim.vehiclePubKey
  store.vehicleVin         = bytesToBinaryString(sim.vin)
  // Tesla protocol: one long-term keypair for both SessionInfoRequest identity
  // and ECDH. Generate a real P-256 keypair, store both halves, and register
  // the pubkey with the simulator's whitelist.
  const watchEcdh = createECDH('prime256v1')
  watchEcdh.generateKeys()
  const watchPriv = new Uint8Array(watchEcdh.getPrivateKey())
  const watchPub = new Uint8Array(watchEcdh.getPublicKey())
  store.watchPublicKey = bytesToBinaryString(watchPub)
  store.watchPrivateKey = bytesToBinaryString(watchPriv)
  sim._enrolledPublicKey = watchPub
  storeDoublingsTable(sim)
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
  setupStore(sim)
  return { sim }
}
