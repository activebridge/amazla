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
import { encodeBytes, encodeVarintField, concat } from '../lib/tesla-ble/protocol/protobuf.js'
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

  test('vehicleMac missing when BLE disconnected → fails with MAC not found', async () => {
    store.vehicleMac = null   // doublings table still present from setupStore
    const result = await p((cb) => session.requestSessionInfo(cb))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/MAC not found/i)
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

// ─── session info response edge cases ────────────────────────────────────────

describe('session info response edge cases', () => {
  // Connect BLE once before each test so requestSessionInfo reaches _doSessionInfoRequest
  beforeEach(async () => {
    await p((cb) => teslaBLE.connect('AA:BB:CC:DD:EE:FF', cb))
  })

  test('BLE send error in _doSessionInfoRequest → reports error', async () => {
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => cb({ success: false, error: 'Write failed' })
    const result = await p((cb) => session.requestSessionInfo(cb))
    teslaBLE.send = origSend
    expect(result.success).toBe(false)
    expect(result.error).toBe('Write failed')
  })

  test('null result.data in session info response → reports no-data error', async () => {
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => cb({ success: true, data: null })
    const result = await p((cb) => session.requestSessionInfo(cb))
    teslaBLE.send = origSend
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no data/i)
  })

  test('response has payload but no sessionInfo → reports missing sessionInfo error', async () => {
    // A response with field 10 (payload) present but no field 3/6 (sessionInfo)
    // passes the intermediate-ack guard but hits the "else" branch in the handler
    const responseBytes = encodeBytes(10, new Uint8Array([0x01, 0x02, 0x03]))
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => cb({ success: true, data: responseBytes })
    const result = await p((cb) => session.requestSessionInfo(cb))
    teslaBLE.send = origSend
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/No session info/i)
  })

  test('intermediate ack before SessionInfo → re-registers handler, session still establishes', async () => {
    // sim._sendIntermediateAck=true makes _handleSessionInfo send a two-field bare response
    // first (no sessionInfo/payload/signedMessageStatus), then the real SessionInfo.
    // session.js lines 147 (sort comparator), 153-156 (intermediate ack re-queue).
    sim._sendIntermediateAck = true
    const result = await p((cb) => session.requestSessionInfo(cb))
    expect(result.success).toBe(true)
    expect(session.established).toBe(true)
  })

  test('vehicleEcPublicKey saved as fallback from SessionInfo when not in store (line 165)', async () => {
    // Stub teslaBLE.send: capture handler, clear vehicleEcPublicKey, deliver valid SessionInfo.
    // session.js line 165: store.vehicleEcPublicKey = publicKey from response.
    let capturedHandler = null
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => {
      capturedHandler = cb
      store.vehicleEcPublicKey = null  // clear AFTER _doSessionInfoRequest started
    }

    const resultPromise = p((cb) => session.requestSessionInfo(cb))

    const epoch = new Uint8Array(16).fill(0xab)
    const si = concat(
      encodeVarintField(1, 1),
      encodeBytes(2, sim.vehiclePubKey),
      encodeBytes(3, epoch),
      encodeVarintField(4, Math.floor(Date.now() / 1000)),
    )
    const tag = sim.signSessionInfo(session.ephemeralPublicKey, session._lastRequestUuid, si)
    const data = concat(encodeBytes(15, si), encodeBytes(13, sim.buildSessionInfoSigData(tag)))
    capturedHandler({ success: true, data })

    const result = await resultPromise
    teslaBLE.send = origSend

    expect(result.success).toBe(true)
    expect(store.vehicleEcPublicKey).toBeDefined()
  })

  test('SessionInfo with no valid pubKey → uses stored vehiclePublicKey (lines 168-172)', async () => {
    // Deliver a SessionInfo response where pubKey is absent (only counter+epoch+clockTime).
    // session.js else branch (168-172): falls back to this.vehiclePublicKey from proceedWithSession.
    let capturedHandler = null
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => { capturedHandler = cb }

    const resultPromise = p((cb) => session.requestSessionInfo(cb))

    const epoch = new Uint8Array(16).fill(0xab)
    const siNoPubKey = concat(
      encodeVarintField(1, 1),       // counter only — no pubKey field
      encodeBytes(3, epoch),
      encodeVarintField(4, Math.floor(Date.now() / 1000)),
    )
    const tag = sim.signSessionInfo(session.ephemeralPublicKey, session._lastRequestUuid, siNoPubKey)
    const data = concat(encodeBytes(15, siNoPubKey), encodeBytes(13, sim.buildSessionInfoSigData(tag)))
    capturedHandler({ success: true, data })

    const result = await resultPromise
    teslaBLE.send = origSend

    // vehiclePublicKey was already set from store, so session establishes despite no pubKey in response
    expect(result.success).toBe(true)
    expect(session.vehiclePublicKey).toBeDefined()
  })

  test('SessionInfo no pubKey and no store key → error (lines 169-174)', async () => {
    // Call _doSessionInfoRequest directly (bypasses proceedWithSession key check).
    // Clear vehiclePublicKey and vehicleEcPublicKey INSIDE stub so else branch at 168
    // finds both null → "Vehicle public key not found" error.
    store.vehicleEcPublicKey = null
    session.vehiclePublicKey = sim.vehiclePubKey  // set so _doSessionInfoRequest can proceed

    let capturedHandler = null
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => {
      session.vehiclePublicKey = null  // null AFTER request sent, BEFORE response processed
      capturedHandler = cb
    }

    const resultPromise = p((cb) => session._doSessionInfoRequest(cb))

    const epoch = new Uint8Array(16).fill(0xab)
    const siNoPubKey = concat(
      encodeVarintField(1, 1),
      encodeBytes(3, epoch),
      encodeVarintField(4, Math.floor(Date.now() / 1000)),
    )
    capturedHandler({ success: true, data: encodeBytes(15, siNoPubKey) })

    const result = await resultPromise
    teslaBLE.send = origSend

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Vehicle public key not found/i)
  })

  test('SessionInfo with null epoch → logs empty-epoch branch (line 186)', async () => {
    // Provide SessionInfo with pubKey but no epoch field → this.epoch = null → line 186
    let capturedHandler = null
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => { capturedHandler = cb }

    const resultPromise = p((cb) => session.requestSessionInfo(cb))

    // SessionInfo: pubKey (65 bytes) + counter + clockTime, but NO epoch (field 3)
    const siNoEpoch = concat(
      encodeVarintField(1, 1),
      encodeBytes(2, sim.vehiclePubKey),
      encodeVarintField(4, Math.floor(Date.now() / 1000)),
    )
    const tag = sim.signSessionInfo(session.ephemeralPublicKey, session._lastRequestUuid, siNoEpoch)
    const data = concat(encodeBytes(15, siNoEpoch), encodeBytes(13, sim.buildSessionInfoSigData(tag)))
    capturedHandler({ success: true, data })

    const result = await resultPromise
    teslaBLE.send = origSend

    // Session still establishes despite null epoch (defensive path)
    expect(result.success).toBe(true)
  })

  test('vehiclePublicKey wrong length → error (lines 195-198)', async () => {
    // Set vehiclePublicKey to a 64-byte key (truthy, wrong length).
    // Deliver SessionInfo without pubKey → else branch leaves vehiclePublicKey at 64 bytes.
    // Lines 195-198: Invalid vehicle public key error.
    session.vehiclePublicKey = new Uint8Array(64)  // wrong length, non-null
    let capturedHandler = null
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => { capturedHandler = cb }

    const resultPromise = p((cb) => session._doSessionInfoRequest(cb))

    const epoch = new Uint8Array(16).fill(0xab)
    const siNoPubKey = concat(
      encodeVarintField(1, 1),
      encodeBytes(3, epoch),
      encodeVarintField(4, Math.floor(Date.now() / 1000)),
    )
    capturedHandler({ success: true, data: encodeBytes(15, siNoPubKey) })

    const result = await resultPromise
    teslaBLE.send = origSend

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Invalid vehicle public key/i)
  })

  test('exception thrown inside sessionInfoResponseHandler → catch (lines 226-228)', async () => {
    // Stub send: corrupt ephemeralPrivateKey to a non-Uint8Array so ecdhFixed throws.
    let capturedHandler = null
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => {
      session.ephemeralPrivateKey = 'corrupt'  // causes ecdhFixed to throw TypeError
      capturedHandler = cb
    }

    const resultPromise = p((cb) => session.requestSessionInfo(cb))

    const epoch = new Uint8Array(16).fill(0xab)
    const si = concat(
      encodeVarintField(1, 1),
      encodeBytes(2, sim.vehiclePubKey),
      encodeBytes(3, epoch),
      encodeVarintField(4, Math.floor(Date.now() / 1000)),
    )
    capturedHandler({ success: true, data: encodeBytes(15, si) })

    const result = await resultPromise
    teslaBLE.send = origSend

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  test('no ECDH table after response received → error (lines 202-203)', async () => {
    // Stub send: capture handler, then delete doublings table, deliver valid SessionInfo.
    // session.js lines 202-203: _ecdhTable is null → error.
    let capturedHandler = null
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => {
      capturedHandler = cb
      delete _fsStore['vehicle_doublings_table.dat']
      store.vehicleDoublingsTable = null  // clears cache
    }

    const resultPromise = p((cb) => session.requestSessionInfo(cb))

    const epoch = new Uint8Array(16).fill(0xab)
    const si = concat(
      encodeVarintField(1, 1),
      encodeBytes(2, sim.vehiclePubKey),
      encodeBytes(3, epoch),
      encodeVarintField(4, Math.floor(Date.now() / 1000)),
    )
    capturedHandler({ success: true, data: encodeBytes(15, si) })

    const result = await resultPromise
    teslaBLE.send = origSend

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/ECDH table/i)
  })
})

// ─── sendCommand error paths ──────────────────────────────────────────────────

describe('sendCommand error paths', () => {
  beforeEach(async () => {
    const r = await p((cb) => session.requestSessionInfo(cb))
    if (!r.success) throw new Error('Session setup failed: ' + r.error)
  })

  test('BLE send failure → reports error, clears waiting state', async () => {
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => cb({ success: false, error: 'TX failed' })
    const result = await p((cb) => session.sendCommand(1, cb))
    teslaBLE.send = origSend
    expect(result.success).toBe(false)
    expect(result.error).toBe('TX failed')
    expect(session._waitingForSecondResponse).toBe(false)
  })

  test('null result.data in getVehicleStatus → reports no-data error', async () => {
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => cb({ success: true, data: null })
    const result = await p((cb) => session.getVehicleStatus(cb))
    teslaBLE.send = origSend
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no data/i)
  })

  test('sendCommand: null result.data → inner catch reports error and clears waiting state', async () => {
    // parseRoutableMessage(null) throws → inner catch in sendCommand (lines 311-316)
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => cb({ success: true, data: null })
    const result = await p((cb) => session.sendCommand(1, cb))
    teslaBLE.send = origSend
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
    expect(session._waitingForSecondResponse).toBe(false)
  })

  test('sendCommand: buildAuthenticatedCommand throws → outer catch reports error', async () => {
    // _cmdHmacFn=null causes _buildHMACTag to throw → outer catch in doSend (lines 315-316)
    session._cmdHmacFn = null
    const result = await p((cb) => session.sendCommand(1, cb))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/HMAC not initialized/i)
  })

  test('sendCommand: auto-establish fails → propagates failure (lines 322-323)', async () => {
    // Fresh session with missing artifacts → ensureSessionEstablished fails,
    // error propagates through sendCommand callback at lines 322-323.
    delete _fsStore['vehicle_doublings_table.dat']
    store.vehicleDoublingsTable = null
    const freshSession = new TeslaSession()
    const result = await p((cb) => freshSession.sendCommand(1, cb))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not paired|doublings table/i)
  })

  test('getVehicleStatus: parseVehicleStatus throws → catch reports error', async () => {
    // data={} passes null guard, decodeMessage({}) returns empty, payload=null,
    // parseVehicleStatus(null) throws → catch in getVehicleStatus (lines 354-355)
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => cb({ success: true, data: {} })
    const result = await p((cb) => session.getVehicleStatus(cb))
    teslaBLE.send = origSend
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  test('second response with actionStatus clears _secondResponseTimer (lines 304-306)', async () => {
    // Stub teslaBLE.send to capture the inlineHandler so we can fire it directly twice.
    // First call: no actionStatus → sets _waitingForSecondResponse + timer.
    // Second call: has actionStatus → hits clearTimeout path (session.js lines 304-306).
    let capturedHandler = null
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => { capturedHandler = cb }

    let cmdResult = null
    session.sendCommand(1, (r) => {
      if (!r._requeue) cmdResult = r
    })

    expect(capturedHandler).not.toBeNull()

    // First response: bare field-5 → no actionStatus, no sessionInfo — intermediate ack
    capturedHandler({ success: true, data: encodeVarintField(5, 0) })
    expect(session._waitingForSecondResponse).toBe(true)
    expect(session._secondResponseTimer).not.toBeNull()

    // Second response: field-1 = 1 → actionStatus = 1 → hits clearTimeout
    capturedHandler({ success: true, data: encodeVarintField(1, 1) })
    expect(session._secondResponseTimer).toBeNull()
    expect(session._waitingForSecondResponse).toBe(false)
    expect(cmdResult).not.toBeNull()
    expect(cmdResult.success).toBe(true)

    teslaBLE.send = origSend
  })
})
