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
import { bytesToBinaryString, binaryStringToBytes } from '../app-side/ble-crypto.js'
import { encodeBytes, encodeVarintField, concat } from '../lib/tesla-ble/protocol/protobuf.js'
import { createECDH } from 'crypto'
import Phone from '../lib/phone.js'

// The phone owns the enrolled private key (the watch never holds it). The
// fixture stashes it here so the Phone.computeSharedSecret stub can compute the
// ECDH the companion would — without a working messageBuilder.
// Node's native ECDH, NOT bleCrypto.computeSharedSecret: the production BigInt
// implementation uses affine double-and-add (a modular inversion per point op)
// and costs seconds per call — it made this suite take ~99% of the whole test
// run and blow the 30s per-test cap under load. The outputs are identical
// (32-byte shared-secret X coordinate); bleCrypto's own math is covered by
// ble-crypto.test.js.
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
  // AND ECDH. Generate a real P-256 keypair, store the PUBLIC half on the watch,
  // keep the private half phone-side (for the ECDH stub), and tell the simulator
  // which pubkey is "enrolled" so its whitelist check passes.
  const watchEcdh = createECDH('prime256v1')
  watchEcdh.generateKeys()
  // Left-pad to a fixed 32 bytes: Node returns the scalar minimally, so ~0.4% of
  // keys are 31 bytes (leading zero) and the phone-side ECDH would reject them.
  const rawPriv = new Uint8Array(watchEcdh.getPrivateKey())
  const watchPriv = rawPriv.length === 32 ? rawPriv : (() => { const o = new Uint8Array(32); o.set(rawPriv, 32 - rawPriv.length); return o })()
  const watchPub = new Uint8Array(watchEcdh.getPublicKey())
  store.watchPublicKey = bytesToBinaryString(watchPub)
  _phonePrivateKey = bytesToBinaryString(watchPriv) // phone holds the private key, not the watch
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

// NO jest.useFakeTimers() anywhere in this file: under the ESM vm-modules runner,
// useRealTimers() after useFakeTimers() DELETES global setTimeout instead of
// restoring it — every later test then crashed the zos-mock scan auto-emit and
// hung for the full 30s jest timeout (the suite took ~396s of pure timeouts).
// Timeout-path tests shrink the session's *TimeoutMs knobs and run on real timers.

beforeEach(() => {
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
    // Real timers: shrink the second-response deadline instead of faking the clock.
    const r = await p((cb) => session.requestSessionInfo(cb))
    if (!r.success) throw new Error('Session setup: ' + r.error)

    session.secondResponseTimeoutMs = 50
    sim.skipSecondResponse()

    let cbResult = null
    await new Promise((resolve) => {
      session.sendCommand(1 /* LOCK */, (res) => {
        // First call: intermediate ack with _requeue — session is waiting.
        if (res._requeue) return
        // Second call: from the timeout path.
        cbResult = res
        resolve()
      })
    })

    expect(cbResult).not.toBeNull()
    expect(cbResult.success).toBe(false)
    expect(cbResult.error).toMatch(/timeout/i)
  })
})

// ─── command timeout (no response / unsolicited-only) ─────────────────────────

describe('command timeout', () => {
  test('car never answers a command → command deadline fires → error, no hang', async () => {
    const r = await p((cb) => session.requestSessionInfo(cb))
    if (!r.success) throw new Error('Session setup: ' + r.error)

    // Real timers: shrink the overall deadline so the test runs fast, then drop
    // the command.
    session.commandTimeoutMs = 100
    sim.setDropCommands(1)

    let cbResult = null
    await new Promise((resolve) => {
      session.sendCommand(1 /* LOCK */, (res) => {
        if (res._requeue) return
        cbResult = res
        resolve()
      })
    })

    expect(cbResult).not.toBeNull()
    expect(cbResult.success).toBe(false)
    expect(cbResult.error).toMatch(/timed out|timeout/i)
    // State fully cleared so the next command isn't blocked.
    expect(session._waitingForSecondResponse).toBe(false)
    expect(session._commandTimer).toBeNull()
  })

  test('command deadline cleared on a normal successful command (no late fire)', async () => {
    const r = await p((cb) => session.requestSessionInfo(cb))
    if (!r.success) throw new Error('Session setup: ' + r.error)
    sim.setState(unlockedCar())
    const result = await p((cb) => session.lock(cb))
    expect(result.success).toBe(true)
    // Terminal success must tear the deadline down so it can't fire later.
    expect(session._commandTimer).toBeNull()
  })
})

// ─── ambient-only watchdog → same-link resend (end-to-end) ─────────────────────

describe('ambient-only stall recovery', () => {
  test('first SessionInfoRequest gets ambient-only → watchdog resends on same link → establishes', async () => {
    // Car answers the first SessionInfoRequest with an ambient-only frame (no
    // SessionInfo); the watchdog fires and resends on the still-open link; the
    // car answers the resend for real. Shrink the timeouts so this runs fast.
    session.sessionInfoAmbientTimeoutMs = 40
    session.sessionInfoResendTimeoutMs = 40
    sim.setAmbientOnlyForSessionInfo(1)

    const sendSpy = jest.spyOn(session, '_doSessionInfoRequest')
    const disconnectSpy = jest.spyOn(teslaBLE, 'disconnect')

    const result = await p((cb) => session.requestSessionInfo(cb))

    expect(result.success).toBe(true)
    expect(session.established).toBe(true)
    // Tier 0: it resent on the same link (2 sends) and never recycled the link.
    expect(sendSpy).toHaveBeenCalledTimes(2)
    expect(disconnectSpy).not.toHaveBeenCalled()
    expect(teslaBLE.isConnected()).toBe(true)

    sendSpy.mockRestore()
    disconnectSpy.mockRestore()
  })

  test('two ambient-only stalls exhaust resends → recycles the link, then establishes', async () => {
    // RESENDS_PER_CONNECT = 2, so 3 ambient-only answers (initial + 2 resends)
    // exhaust tier 0 on the first connection and force a tier-1 reconnect.
    session.sessionInfoAmbientTimeoutMs = 30
    session.sessionInfoResendTimeoutMs = 30
    session.recycleSettleMs = 20
    sim.setAmbientOnlyForSessionInfo(3)

    const disconnectSpy = jest.spyOn(teslaBLE, 'disconnect')

    const result = await p((cb) => session.requestSessionInfo(cb))

    expect(result.success).toBe(true)
    expect(session.established).toBe(true)
    expect(disconnectSpy).toHaveBeenCalled() // tier 1 recycle happened

    disconnectSpy.mockRestore()
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
    // Status/commands TX via sendAddressed (addressed waiters), not send()
    const origSend = teslaBLE.sendAddressed.bind(teslaBLE)
    teslaBLE.sendAddressed = (_msg, _match, cb) => cb({ success: false, error: 'BLE write failed' })
    const result = await p((cb) => session.getVehicleStatus(cb))
    teslaBLE.sendAddressed = origSend
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

  test('disconnect during GATT setup → re-dial loop recovers on the next attempt', async () => {
    // Cold-connect fix (device-validated): a mid-GATT-setup drop is retried up to
    // MAX_CONNECT_ATTEMPTS on the same MAC. The harness flag is one-shot, so
    // attempt 1 drops and attempt 2 must succeed.
    bleHarness._disconnectDuringPrepare = true
    const result = await p((cb) => session.requestSessionInfo(cb))
    expect(result.success).toBe(true)
    expect(session.established).toBe(true)
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
    // Commands TX via sendAddressed (addressed waiters), not send()
    const origSend = teslaBLE.sendAddressed.bind(teslaBLE)
    teslaBLE.sendAddressed = (_msg, _match, cb) => cb({ success: false, error: 'TX failed' })
    const result = await p((cb) => session.sendCommand(1, cb))
    teslaBLE.sendAddressed = origSend
    expect(result.success).toBe(false)
    expect(result.error).toBe('TX failed')
    expect(session._waitingForSecondResponse).toBe(false)
  })

  test('null result.data in getVehicleStatus → reports an error, does not hang', async () => {
    const origSend = teslaBLE.sendAddressed.bind(teslaBLE)
    teslaBLE.sendAddressed = (_msg, _match, cb) => cb({ success: true, data: null })
    const result = await p((cb) => session.getVehicleStatus(cb))
    teslaBLE.sendAddressed = origSend
    // The addressed-waiter path can't produce a null payload in production; the
    // synthetic null is caught by the handler's try/catch and reported.
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  test('sendCommand: null result.data → inner catch reports error and clears waiting state', async () => {
    // parseRoutableMessage(null) throws → inner catch in sendCommand
    const origSend = teslaBLE.sendAddressed.bind(teslaBLE)
    teslaBLE.sendAddressed = (_msg, _match, cb) => cb({ success: true, data: null })
    const result = await p((cb) => session.sendCommand(1, cb))
    teslaBLE.sendAddressed = origSend
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
    // An addressed reply (so it passes the addressedToUs + vehicleStatus guards)
    // whose VehicleStatus bytes are malformed protobuf (field 1 claims 5 bytes but
    // only 2 follow) → parseVehicleStatus → decodeMessage throws → catch reports it.
    const badVehicleStatus = new Uint8Array([0x0a, 0x05, 0x01, 0x02])
    const fromVcsec = encodeBytes(1, badVehicleStatus)              // FromVCSECMessage.vehicleStatus
    const toDest = encodeBytes(6, encodeBytes(2, session.routingAddress))
    const responseBytes = concat(toDest, encodeBytes(10, fromVcsec))
    const origSend = teslaBLE.sendAddressed.bind(teslaBLE)
    teslaBLE.sendAddressed = (_msg, _match, cb) => cb({ success: true, data: responseBytes })
    const result = await p((cb) => session.getVehicleStatus(cb))
    teslaBLE.sendAddressed = origSend
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  test('second response with commandStatus clears _secondResponseTimer', async () => {
    // First response: non-terminal (no commandStatus / signedMessageStatus) → waiting.
    // Second response: FromVCSECMessage { commandStatus { operationStatus=OK } } → clearTimeout + success.
    let capturedHandler = null
    const origSend = teslaBLE.sendAddressed.bind(teslaBLE)
    teslaBLE.sendAddressed = (_msg, _match, cb) => { capturedHandler = cb }

    let cmdResult = null
    session.sendCommand(1, (r) => {
      if (!r._requeue) cmdResult = r
    })

    expect(capturedHandler).not.toBeNull()

    // Real vehicle responses are addressed to the command's routing address via
    // to_destination (field 6 → routing_address field 2); otherwise session.js
    // treats them as unsolicited pushes and keeps listening.
    const toDest = encodeBytes(6, encodeBytes(2, session.routingAddress))

    // First: SessionInfo-only push (field 15, no commandStatus/payload) — the
    // car heard us, the action ack follows → arms the second-response wait.
    // Needs an epoch: the parser only surfaces sessionInfo when epoch/publicKey present.
    const siPush = concat(encodeVarintField(1, 2), encodeBytes(3, new Uint8Array(16).fill(0xab)))
    capturedHandler({ success: true, data: concat(toDest, encodeBytes(15, siPush)) })
    expect(session._waitingForSecondResponse).toBe(true)
    expect(session._secondResponseTimer).not.toBeNull()

    // Second: FromVCSECMessage.commandStatus.operationStatus = OK(0)
    const okResponse = concat(toDest, encodeBytes(10, encodeBytes(4, encodeVarintField(1, 0))))
    capturedHandler({ success: true, data: okResponse })
    expect(session._secondResponseTimer).toBeNull()
    expect(session._waitingForSecondResponse).toBe(false)
    expect(cmdResult).not.toBeNull()
    expect(cmdResult.success).toBe(true)

    teslaBLE.sendAddressed = origSend
  })
})
