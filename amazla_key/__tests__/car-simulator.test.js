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
 *   3. Generate long-term enrolled watch keypair, enroll in sim whitelist
 *   4. Install harness + simulator → tests run full session establishment
 */

import { jest } from '@jest/globals'

jest.setTimeout(30000)
import { TeslaSession } from '../lib/tesla-ble/session.js'
// Tests must stub the SAME singleton session.js uses (easy-ble path) or the
// stubs silently no-op. Pre-swap, this imported ble-native.js which is why
// 72/489 tests were failing.
import teslaBLE from '../lib/tesla-ble/ble.js'
import { computeTeslaBLEName } from '../lib/tesla-ble/ble-name.js'
import store from '../lib/store.js'
import { bleHarness, _fsStore } from '../__mocks__/zos.js'
import { CarSimulator } from './helpers/car-simulator.js'
import { lockedCar, unlockedCar, allDoorsOpen, sleeping } from './helpers/scenarios.js'
import bleCrypto, { bytesToBinaryString, binaryStringToBytes } from '../app-side/ble-crypto.js'
import { encodeBytes, encodeVarintField, concat } from '../lib/tesla-ble/protocol/protobuf.js'
import { createECDH } from 'crypto'
import Phone from '../lib/phone.js'

// Stub Phone.computeSharedSecret so session.js's slow path derives a real session
// key without a working messageBuilder — runs the same bleCrypto ECDH the
// companion would, against the watch private key in the store.
Phone.prototype.computeSharedSecret = function (vehiclePubBytes) {
  const r = bleCrypto.computeSharedSecret(bytesToBinaryString(store.watchPrivateKey), bytesToBinaryString(vehiclePubBytes))
  if (!r.success) return Promise.reject(new Error(r.error))
  return Promise.resolve(binaryStringToBytes(r.secret))
}

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

/** Wire up all store fields + harness for a given simulator */
function setupStore(sim) {
  store.vehicleMac        = 'AA:BB:CC:DD:EE:FF'
  store.vehicleEcPublicKey = sim.vehiclePubKey
  store.vehicleVin         = bytesToBinaryString(sim.vin)
  // Tesla protocol: ONE long-term keypair for both SessionInfoRequest identity
  // AND ECDH. Generate a real P-256 keypair, store both halves on watch, and
  // tell the simulator which pubkey is "enrolled" so its whitelist check passes.
  const watchEcdh = createECDH('prime256v1')
  watchEcdh.generateKeys()
  // Left-pad to a fixed 32 bytes: Node returns the scalar minimally, so ~0.4% of
  // keys are 31 bytes (leading zero) and session.js would reject them as "Watch
  // keypair missing" — a pre-existing ~1-in-5 harness flake.
  const rawPriv = new Uint8Array(watchEcdh.getPrivateKey())
  const watchPriv = rawPriv.length === 32 ? rawPriv : (() => { const o = new Uint8Array(32); o.set(rawPriv, 32 - rawPriv.length); return o })()
  const watchPub = new Uint8Array(watchEcdh.getPublicKey())
  store.watchPublicKey = bytesToBinaryString(watchPub)
  store.watchPrivateKey = bytesToBinaryString(watchPriv)
  sim._enrolledPublicKey = watchPub
  // No cached sessionKey seeded — first establish runs the slow path (phone
  // computeSharedSecret → derive → cache), mirroring a fresh pairing.
  // Production session.js scans by VIN-derived local name (Tesla rotates the
  // BLE MAC every ~15 min). Tell the harness which beacon to surface so the
  // scan resolves immediately instead of waiting the full duration.
  bleHarness.setScanAutoEmit({
    name: computeTeslaBLEName(store.vehicleVin),
    mac: 'AA:BB:CC:DD:EE:FF',
  })
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

  // Reset BLE singleton (clear connected state, BLEMaster #devices cache, handlers).
  teslaBLE.reset()
  teslaBLE.chunkIntervalMs = 0 // pacing-agnostic: don't couple test timing to prod chunk delay

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

  test('session.established stays false if watch keypair missing', async () => {
    // Per Tesla protocol, session establishment requires the long-term
    // enrolled keypair (priv32 + pub65) on the watch. Without it we cannot
    // sign SessionInfoRequest as a whitelisted identity nor derive ECDH.
    store.reset()
    store.vehicleMac         = 'AA:BB:CC:DD:EE:FF'
    store.vehicleVin         = bytesToBinaryString(sim.vin)
    store.vehicleEcPublicKey = sim.vehiclePubKey
    // no watchPublicKey / watchPrivateKey
    const result = await p((cb) => session.requestSessionInfo(cb))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/keypair missing|re-pair/i)
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
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/rejected/i)
    expect(result.response.commandStatus.operationStatus).toBe(2)
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

  test('no cached key → derives via phone ECDH and caches key + EC', async () => {
    // Fresh state (no cached sessionKey): session.js takes the slow path —
    // phone.computeSharedSecret → sha1 → cache. Verifies the key + EC are
    // persisted after a successful establish.
    store.vehicleEcPublicKey = null
    expect(store.sessionKey).toBeFalsy()
    const result = await p((cb) => session.requestSessionInfo(cb))
    expect(result.success).toBe(true)
    expect(store.vehicleEcPublicKey).toBeDefined()
    expect(store.sessionKey && store.sessionKey.length).toBe(16)
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
  test('no cached key + phone unreachable → fails with re-pair guidance (case 3)', async () => {
    // With the table dropped, the slow path needs the phone to compute the ECDH.
    // If it's unreachable (lost cache, no companion), establish fails and tells
    // the user to re-pair — and nothing bad is cached.
    store.vehicleEcPublicKey = null
    const origCompute = Phone.prototype.computeSharedSecret
    Phone.prototype.computeSharedSecret = () => Promise.reject(new Error('messageBuilder not available'))
    const result = await p((cb) => session.requestSessionInfo(cb))
    Phone.prototype.computeSharedSecret = origCompute
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/re-pair|derive session key/i)
    expect(store.sessionKey).toBeFalsy()
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

  test('no Tesla beacon during scan → fails with not-in-range error', async () => {
    // Tesla rotates the BLE MAC every ~15 min; session.js scans by VIN-derived
    // local name on every connect rather than trusting the stored MAC. When
    // the car never beacons, the scan completes empty and we should report it.
    store.vehicleMac = null
    bleHarness.setScanAutoEmit(null)
    const result = await p((cb) => session.requestSessionInfo(cb))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not in BLE range/i)
  })

  test('VIN missing → cannot derive BLE name, fails with VIN-not-set error', async () => {
    store.vehicleVin = null
    bleHarness.setScanAutoEmit(null)
    const result = await p((cb) => session.requestSessionInfo(cb))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/VIN not set/i)
  })

  test('disconnect during GATT setup → fails (single-attempt connect, no retry)', async () => {
    bleHarness._disconnectDuringPrepare = true
    const result = await p((cb) => session.requestSessionInfo(cb))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/disconnected during setup/i)
    expect(session.established).toBe(false)
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

  test('vehicleEcPublicKey saved from SessionInfo when not in store (rebuild path)', async () => {
    // vehicleEcPublicKey is populated from the SessionInfo response on the slow
    // path (phone computeSharedSecret → derive → _finalizeSession persists EC +
    // key after verify). This clears EC mid-flow and verifies it's restored.
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

  test('exception thrown inside sessionInfoResponseHandler → catch', async () => {
    // Force a synchronous throw in the handler's try block: seed a cached key so
    // the fast path runs _finalizeSession synchronously, then make the tag verify
    // throw. The outer try/catch in _handleSessionInfoResponse should report it.
    store.vehicleEcPublicKey = sim.vehiclePubKey
    store.sessionKey = new Uint8Array(16).fill(0xcd)
    session._verifySessionInfoTag = () => { throw new Error('boom') }

    let capturedHandler = null
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => { capturedHandler = cb }

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
    expect(result.error).toMatch(/boom/)
  })

  test('cached key cleared mid-flight → slow path re-derives via phone and re-caches', async () => {
    // The cache is invalidated between request and response (e.g. lost file). The
    // slow path must kick in on the response: phone computeSharedSecret → derive →
    // verify → re-cache. Mirrors a stale/absent cache recovering on connect.
    let capturedHandler = null
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => {
      capturedHandler = cb
      store.sessionKey = null          // clear cached key
      store.vehicleEcPublicKey = null  // force the slow (derive) path
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
    expect(store.sessionKey && store.sessionKey.length).toBe(16)
    expect(store.vehicleEcPublicKey).toBeDefined()
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

  test('sendCommand: auto-establish fails when not paired → propagates failure', async () => {
    // With table now built on-demand from SessionInfo, simulating "auto-establish
    // failure" means making store.isPaired false (the explicit early-out). Wipe
    // the VIN to trip that gate.
    store.vehicleVin = null
    const freshSession = new TeslaSession()
    const result = await p((cb) => freshSession.sendCommand(1, cb))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not paired/i)
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

  test('second response with commandStatus clears _secondResponseTimer', async () => {
    // First response: non-terminal (no commandStatus / signedMessageStatus) → waiting.
    // Second response: FromVCSECMessage { commandStatus { operationStatus=OK } } → clearTimeout + success.
    let capturedHandler = null
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => { capturedHandler = cb }

    let cmdResult = null
    session.sendCommand(1, (r) => {
      if (!r._requeue) cmdResult = r
    })

    expect(capturedHandler).not.toBeNull()

    // Real vehicle responses are addressed to the command's routing address via
    // to_destination (field 6 → routing_address field 2); otherwise session.js
    // treats them as unsolicited pushes and keeps listening.
    const toDest = encodeBytes(6, encodeBytes(2, session.routingAddress))

    // First: bare field-5 → no commandStatus, no signedMessageStatus → waiting
    capturedHandler({ success: true, data: concat(toDest, encodeVarintField(5, 0)) })
    expect(session._waitingForSecondResponse).toBe(true)
    expect(session._secondResponseTimer).not.toBeNull()

    // Second: FromVCSECMessage.commandStatus.operationStatus = OK(0)
    const okResponse = concat(toDest, encodeBytes(10, encodeBytes(4, encodeVarintField(1, 0))))
    capturedHandler({ success: true, data: okResponse })
    expect(session._secondResponseTimer).toBeNull()
    expect(session._waitingForSecondResponse).toBe(false)
    expect(cmdResult).not.toBeNull()
    expect(cmdResult.success).toBe(true)

    teslaBLE.send = origSend
  })
})
