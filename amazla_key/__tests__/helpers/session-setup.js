/**
 * Session test harness helpers.
 *
 * Wires up store + BLEHarness + CarSimulator for tests that exercise session.js.
 * Produces a real P-256 doublings table and key pool so ECDH + HMAC execute
 * against genuine crypto — only the transport (@zos/ble) and storage (@zos/fs)
 * are stubbed.
 */

import { createECDH } from 'crypto'
import store from '../../lib/store.js'
import teslaBLE from '../../lib/tesla-ble/ble.js'
import { computeTeslaBLEName } from '../../lib/tesla-ble/ble-name.js'
import { bleHarness, _fsStore } from '../../__mocks__/zos.js'
import { CarSimulator } from './car-simulator.js'
import bleCrypto, { bytesToBinaryString } from '../../app-side/ble-crypto.js'

/** Wrap a callback-style function as a Promise */
export const p = (fn) => new Promise((resolve) => fn(resolve))

/** One 97-byte key pool entry (P-256 priv32 + pub65) */
const makePoolEntry = () => {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const entry = new Uint8Array(97)
  entry.set(new Uint8Array(ecdh.getPrivateKey()), 0)
  entry.set(new Uint8Array(ecdh.getPublicKey()),  32)
  return entry
}

/** Build and store a key pool with `n` entries */
export const buildPool = (n = 5) => {
  const pool = new Uint8Array(n * 97)
  for (let i = 0; i < n; i++) pool.set(makePoolEntry(), i * 97)
  store.keyPool = pool
}

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
  store.watchPublicKey     = bytesToBinaryString(new Uint8Array(65).fill(0x04))
  storeDoublingsTable(sim)
  buildPool(5)
  // Production session.js scans by VIN-derived local name (Tesla rotates the
  // BLE MAC every ~15 min). Make the harness surface a matching beacon so the
  // scan resolves immediately instead of waiting out the scan duration.
  bleHarness.setScanAutoEmit({
    name: computeTeslaBLEName(store.vehicleVin),
    mac: 'AA:BB:CC:DD:EE:FF',
  })
}

/** Clear persisted FS-backed state (doublings table, key pool) */
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
