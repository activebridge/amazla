/**
 * End-to-end VCR tests for Tesla BLE.
 *
 * ble-native.js and session.js run completely unmodified.
 * The BLEHarness intercepts @zos/ble native functions; CarSimulator generates
 * realistic vehicle responses at the raw byte level.
 *
 * Test setup:
 *   1. Generate fresh vehicle keypair (CarSimulator)
 *   2. Build ECDH doublings table from vehicle pubkey (app-side bleCrypto)
 *   3. Generate ephemeral watch keypair, store in key pool (store.keyPool)
 *   4. Install harness + simulator → tests run full session establishment
 */

import { jest } from '@jest/globals'

jest.setTimeout(30000)
import { TeslaSession } from '../lib/tesla-ble/session.js'
import teslaBLE from '../lib/tesla-ble/ble-native.js'
import store from '../lib/store.js'
import { bleHarness, _fsStore } from '../__mocks__/zos.js'
import { CarSimulator } from './helpers/car-simulator.js'
import { lockedCar, unlockedCar, allDoorsOpen, sleeping } from './helpers/scenarios.js'
import bleCrypto, { bytesToBinaryString } from '../app-side/ble-crypto.js'
import { createECDH } from 'crypto'

// Track real timers created by production code (e.g., CCCD fallback) so tests can clear them.
const _realSetTimeout = global.setTimeout
const _realClearTimeout = global.clearTimeout
const _trackedTimers = new Set()
global.setTimeout = (...args) => {
  const handle = _realSetTimeout(...args)
  _trackedTimers.add(handle)
  return handle
}
global.clearTimeout = (handle, ...rest) => {
  _trackedTimers.delete(handle)
  return _realClearTimeout(handle, ...rest)
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Wrap a session callback as a Promise */
function p(fn) {
  return new Promise((resolve) => fn(resolve))
}

/** Generate one 97-byte key pool entry (P-256 priv32 + pub65) */
function makePoolEntry() {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const entry = new Uint8Array(97)
  entry.set(new Uint8Array(ecdh.getPrivateKey()), 0)
  entry.set(new Uint8Array(ecdh.getPublicKey()),  32)
  return entry
}

/** Build and store a key pool with `n` entries */
function buildPool(n = 5) {
  const pool = new Uint8Array(n * 97)
  for (let i = 0; i < n; i++) pool.set(makePoolEntry(), i * 97)
  store.keyPool = pool
}

/** Build doublings table from sim.vehiclePubKey and store it */
function storeDoublingsTable(sim) {
  const pubKeyBinary = bytesToBinaryString(sim.vehiclePubKey)
  const result = bleCrypto.buildDoublingsTable(pubKeyBinary)
  if (!result.success) throw new Error('buildDoublingsTable failed: ' + result.error)
  store.vehicleDoublingsTable = new Uint8Array(result.buffer)
}

/** Wire up all store fields + harness for a given simulator */
function setupStore(sim) {
  store.vehicleMac        = 'AA:BB:CC:DD:EE:FF'
  store.vehicleEcPublicKey = sim.vehiclePubKey
  store.vehicleVin         = bytesToBinaryString(sim.vin)
  store.watchPublicKey     = bytesToBinaryString(new Uint8Array(65).fill(0x04))  // dummy enrolled key
  storeDoublingsTable(sim)
  buildPool(5)
}

// ─── test lifecycle ───────────────────────────────────────────────────────────

let sim
let session

beforeEach(() => {
  // Ensure real timers and no leftover timers from previous tests (fake timers can leak)
  jest.useRealTimers()
  jest.clearAllTimers()
  // Clear all persisted state
  Object.keys(_fsStore).forEach((k) => delete _fsStore[k])
  store.reset()

  // Fresh simulator + harness
  sim = new CarSimulator()
  bleHarness.reset()
  bleHarness.setSimulator(sim)

  // Reset BLE native singleton (clear connected state, handlers, etc.)
  teslaBLE.reset()

  // Populate store
  setupStore(sim)

  // Fresh session
  session = new TeslaSession()
})

afterEach(() => {
  // Restore real timers and clear any remaining timeouts
  try { jest.useRealTimers() } catch (e) {}
  try { jest.clearAllTimers() } catch (e) {}
  // Clear any tracked native timers created by production code
  for (const t of Array.from(_trackedTimers)) try { _realClearTimeout(t) } catch (e) {}
  _trackedTimers.clear()
  session.reset()
  teslaBLE.reset()
})

// ─── connection + session establishment ───────────────────────────────────────

describe('BLE connection and session establishment', () => {
  test('connect() succeeds and teslaBLE reports connected', async () => {
    const result = await p((cb) => teslaBLE.connect('AA:BB:CC:DD:EE:FF', cb))
    expect(result.success).toBe(true)
    expect(teslaBLE.isConnected()).toBe(true)
  })

  test('requestSessionInfo establishes session', async () => {
    const result = await p((cb) => session.requestSessionInfo(cb))
    expect(result.success).toBe(true)
    expect(session.established).toBe(true)
    expect(session.sessionKey).toBeDefined()
    expect(session.epoch).toBeInstanceOf(Uint8Array)
    expect(session.counter).toBeGreaterThan(0)
  })

  test('session.established stays false if key pool is empty', async () => {
    store.reset()
    store.vehicleMac         = 'AA:BB:CC:DD:EE:FF'
    store.vehicleVin         = bytesToBinaryString(sim.vin)
    store.vehicleEcPublicKey = sim.vehiclePubKey
    storeDoublingsTable(sim)
    // no key pool
    const result = await p((cb) => session.requestSessionInfo(cb))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/pool empty/i)
  })
})

// ─── RKE commands ─────────────────────────────────────────────────────────────

describe('RKE commands', () => {

  test('lock — state becomes locked and callback reports success', async () => {
    // Establish session for this test to avoid cross-test races
    const r = await p((cb) => session.requestSessionInfo(cb))
    if (!r.success) throw new Error('Session setup failed: ' + r.error)
    sim.setState(unlockedCar())
    const result = await p((cb) => session.lock(cb))
    expect(result.success).toBe(true)
    expect(sim.state.locked).toBe(true)
  })

  test('unlock — state becomes unlocked and callback reports success', async () => {
    const r = await p((cb) => session.requestSessionInfo(cb))
    if (!r.success) throw new Error('Session setup failed: ' + r.error)
    sim.setState(lockedCar())
    const result = await p((cb) => session.unlock(cb))
    expect(result.success).toBe(true)
    expect(sim.state.locked).toBe(false)
  })

  test('open rear trunk — rearTrunk becomes 1', async () => {
    const r = await p((cb) => session.requestSessionInfo(cb))
    if (!r.success) throw new Error('Session setup failed: ' + r.error)
    sim.setState(unlockedCar())
    const result = await p((cb) => session.sendCommand(2 /* OPEN_TRUNK */, cb))
    expect(result.success).toBe(true)
    expect(sim.state.rearTrunk).toBe(1)
  })

  test('open frunk — frontTrunk becomes 1', async () => {
    const r = await p((cb) => session.requestSessionInfo(cb))
    if (!r.success) throw new Error('Session setup failed: ' + r.error)
    sim.setState(unlockedCar())
    const result = await p((cb) => session.sendCommand(3 /* OPEN_FRUNK */, cb))
    expect(result.success).toBe(true)
    expect(sim.state.frontTrunk).toBe(1)
  })

  test('lock is idempotent on already-locked car', async () => {
    const r = await p((cb) => session.requestSessionInfo(cb))
    if (!r.success) throw new Error('Session setup failed: ' + r.error)
    sim.setState(lockedCar())
    const result = await p((cb) => session.lock(cb))
    expect(result.success).toBe(true)
    expect(sim.state.locked).toBe(true)
  })

  test('injected command error → callback reports failure', async () => {
    const r = await p((cb) => session.requestSessionInfo(cb))
    if (!r.success) throw new Error('Session setup failed: ' + r.error)
    sim.injectCommandError()
    const result = await p((cb) => session.lock(cb))
    // actionStatus = 2 (error) — session.js returns success:true with response,
    // the actionStatus value is in result.response.actionStatus
    expect(result.success).toBe(true)
    expect(result.response.actionStatus).toBe(2)
  })
})

// ─── vehicle status ───────────────────────────────────────────────────────────

describe('getVehicleStatus', () => {
  beforeEach(async () => {
    const r = await p((cb) => session.requestSessionInfo(cb))
    if (!r.success) throw new Error('Session setup failed: ' + r.error)
  })

  test('locked car → vehicleLockState = 1', async () => {
    sim.setState(lockedCar())
    const result = await p((cb) => session.getVehicleStatus(cb))
    expect(result.success).toBe(true)
    expect(result.status.vehicleLockState).toBe(1)
  })

  test('unlocked car → vehicleLockState = 0', async () => {
    sim.setState(unlockedCar())
    const result = await p((cb) => session.getVehicleStatus(cb))
    expect(result.success).toBe(true)
    expect(result.status.vehicleLockState).toBe(0)
  })

  test('all doors open → closure flags set correctly', async () => {
    sim.setState(allDoorsOpen())
    const result = await p((cb) => session.getVehicleStatus(cb))
    expect(result.success).toBe(true)
    const cs = result.status.closureStatuses
    expect(cs.frontDriverDoor).toBe(1)
    expect(cs.frontPassengerDoor).toBe(1)
    expect(cs.rearDriverDoor).toBe(1)
    expect(cs.rearPassengerDoor).toBe(1)
    expect(cs.rearTrunk).toBe(0)
    expect(cs.frontTrunk).toBe(0)
  })

  test('status reflects state after unlock', async () => {
    sim.setState(lockedCar())
    await p((cb) => session.unlock(cb))
    const result = await p((cb) => session.getVehicleStatus(cb))
    expect(result.status.vehicleLockState).toBe(0)
  })

  test('sleeping car → sleepStatus is 1', async () => {
    sim.setState(sleeping())
    const result = await p((cb) => session.getVehicleStatus(cb))
    expect(result.success).toBe(true)
    expect(result.status.vehicleSleepStatus).toBe(1)
  })
})

// ─── second-response timeout ──────────────────────────────────────────────────

describe('second-response timeout', () => {
  test('skipSecondResponse → session times out and returns error', async () => {
    jest.useFakeTimers()
    try {
      // Session setup: advance timers alongside await to flush 20ms BLE chunk pacing
      const [r] = await Promise.all([
        p((cb) => session.requestSessionInfo(cb)),
        jest.advanceTimersByTimeAsync(500),
      ])
      if (!r.success) throw new Error('Session setup: ' + r.error)

      sim.skipSecondResponse()

      let cbResult = null
      const cmdPromise = new Promise((resolve) => {
        session.sendCommand(1 /* LOCK */, (res) => {
          // First call: intermediate ack with _requeue — session is waiting
          if (res._requeue) return
          // Second call: from timeout path
          cbResult = res
          resolve()
        })
      })

      // Advance past chunk pacing (~80ms) + 10-second command timeout
      await Promise.all([cmdPromise, jest.advanceTimersByTimeAsync(11000)])

      expect(cbResult).not.toBeNull()
      expect(cbResult.success).toBe(false)
      expect(cbResult.error).toMatch(/timeout/i)
    } finally {
      jest.useRealTimers()
    }
  })
})

// ─── session auto-establishes ─────────────────────────────────────────────────

describe('session auto-establishment', () => {
  test('sendCommand establishes session automatically if not yet established', async () => {
    expect(session.established).toBe(false)
    sim.setState(lockedCar())
    const result = await p((cb) => session.unlock(cb))
    expect(result.success).toBe(true)
    expect(session.established).toBe(true)
    expect(sim.state.locked).toBe(false)
  })
})

// ─── ensureSessionEstablished ─────────────────────────────────────────────────

describe('ensureSessionEstablished', () => {
  test('calls back immediately when session already established', async () => {
    await p((cb) => session.requestSessionInfo(cb))
    expect(session.established).toBe(true)
    const result = await p((cb) => session.ensureSessionEstablished(cb))
    expect(result.success).toBe(true)
  })

  test('fails immediately when not paired (no vehicleMac)', async () => {
    store.reset()
    const result = await p((cb) => session.ensureSessionEstablished(cb))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not paired/i)
  })

  test('concurrent callers all get callbacks — only one connection made', async () => {
    let connectCount = 0
    const origConnect = teslaBLE.connect.bind(teslaBLE)
    teslaBLE.connect = (mac, cb, attempt) => {
      connectCount++
      origConnect(mac, cb, attempt)
    }

    const results = await Promise.all([
      p((cb) => session.ensureSessionEstablished(cb)),
      p((cb) => session.ensureSessionEstablished(cb)),
      p((cb) => session.ensureSessionEstablished(cb)),
    ])

    teslaBLE.connect = origConnect
    expect(results.every(r => r.success)).toBe(true)
    expect(connectCount).toBe(1)
  })
})

// ─── getVehicleStatus ─────────────────────────────────────────────────────────

describe('getVehicleStatus', () => {
  test('returns status when session established', async () => {
    await p((cb) => session.requestSessionInfo(cb))
    sim.setState(unlockedCar())
    const result = await p((cb) => session.getVehicleStatus(cb))
    expect(result.success).toBe(true)
    expect(result.status).toBeDefined()
    expect(result.status.vehicleLockState).toBe(0)  // unlocked
  })

  test('fails when session not established', async () => {
    const result = await p((cb) => session.getVehicleStatus(cb))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/session not established/i)
  })

  test('fails when EC key missing', async () => {
    store.vehicleEcPublicKey = null  // clears from storage via guarded setter
    const result = await p((cb) => session.requestSessionInfo(cb))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/ec key missing/i)
  })

  test('propagates BLE send error', async () => {
    await p((cb) => session.requestSessionInfo(cb))
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => cb({ success: false, error: 'BLE write failed' })
    const result = await p((cb) => session.getVehicleStatus(cb))
    teslaBLE.send = origSend
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/BLE write failed/)
  })
})

// ─── connection error paths ───────────────────────────────────────────────────

describe('connection error paths', () => {
  test('no doublings table → fails immediately with descriptive error', async () => {
    store.reset()
    store.vehicleMac         = 'AA:BB:CC:DD:EE:FF'
    store.vehicleVin         = bytesToBinaryString(sim.vin)
    store.vehicleEcPublicKey = sim.vehiclePubKey
    buildPool(5)
    // no doublings table
    const result = await p((cb) => session.requestSessionInfo(cb))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/doublings table/i)
  })

  test('already connected → skips BLE connect, reuses existing connection', async () => {
    await p((cb) => teslaBLE.connect('AA:BB:CC:DD:EE:FF', cb))
    expect(teslaBLE.isConnected()).toBe(true)

    let connectCount = 0
    const origConnect = teslaBLE.connect.bind(teslaBLE)
    teslaBLE.connect = (mac, cb, attempt) => { connectCount++; origConnect(mac, cb, attempt) }

    const result = await p((cb) => session.requestSessionInfo(cb))
    teslaBLE.connect = origConnect

    expect(result.success).toBe(true)
    expect(connectCount).toBe(0)
  })

  test('connection failure (non-retry error) → returns BLE connection error', async () => {
    const origConnect = teslaBLE.connect.bind(teslaBLE)
    teslaBLE.connect = (_mac, cb) => cb({ success: false, error: 'Connection failed' })

    const result = await p((cb) => session.requestSessionInfo(cb))
    teslaBLE.connect = origConnect

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/BLE connection failed/i)
  })

  test('disconnect during GATT setup → retries once and succeeds', async () => {
    jest.useFakeTimers()
    try {
      bleHarness._disconnectDuringPrepare = true

      // Promise.all drives the async chain while advancing timers to flush:
      //   2000ms retry delay + BLE chunk pacing (several 20ms timers)
      const [result] = await Promise.all([
        p((cb) => session.requestSessionInfo(cb)),
        jest.advanceTimersByTimeAsync(5000),
      ])

      expect(result.success).toBe(true)
      expect(session.established).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })
})
