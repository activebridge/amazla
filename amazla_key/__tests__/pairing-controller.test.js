/**
 * Integration tests for createPairingController (lib/tesla-ble/pairing.js).
 *
 * Uses the full BLEHarness + CarSimulator stack so that real BLE framing,
 * VCSEC protobuf messages, and ECDH crypto all run unmodified.
 *
 * The Phone mock calls bleCrypto.pairSetup / bleCrypto.completePairing directly
 * so that test-generated keypairs produce valid messages that the simulator can
 * parse — no stubs for the crypto layer.
 *
 * All BLE harness operations are synchronous; the only real async boundary is
 * the `setTimeout(doVerify, 500)` in pairing.js after an OK pair response.
 * Tests use jest.useFakeTimers() + jest.runAllTimersAsync() to flush those.
 */

import { jest } from '@jest/globals'
import { createPairingController } from '../lib/tesla-ble/pairing.js'
import teslaBLE from '../lib/tesla-ble/ble.js'
import { computeTeslaBLEName } from '../lib/tesla-ble/ble-name.js'
import store from '../lib/store.js'
import { bleHarness, _fsStore } from '../__mocks__/zos.js'
import { CarSimulator } from './helpers/car-simulator.js'
import bleCrypto, { binaryStringToBytes, bytesToBinaryString } from '../app-side/ble-crypto.js'
import { encodeBytes, encodeVarintField } from '../lib/tesla-ble/protocol/protobuf.js'

jest.setTimeout(30000)

// ─── phone mock ────────────────────────────────────────────────────────────────

/**
 * Build a mock Phone that delegates crypto to the real bleCrypto singleton.
 * `overrides` replaces individual methods for error-injection tests.
 */
function makePhone(overrides = {}) {
  return {
    pairSetup(cb) {
      // Mirrors the real phone-side flow: app-side/index.js BLE_PAIR_SETUP
      // generates a fresh keypair, stores BOTH halves in settings, and returns
      // both to the watch. lib/phone.js then persists store.watchPrivateKey
      // alongside store.watchPublicKey. Tests must reproduce this contract or
      // session establishment will fail later with "Watch keypair missing".
      const result = bleCrypto.pairSetup()  // generates a fresh watch keypair
      if (!result.success) return cb({ success: false, error: result.error })
      store.watchPublicKey = result.watchPublicKey  // binary string
      // Real flow: app-side reads tesla_private_key from settingsStorage and
      // returns it as watchPrivateKey; phone.js persists it on the watch.
      // bleCrypto.pairSetup() doesn't expose the private key, so generate one
      // here that's structurally valid (32 bytes) — pair flow itself never
      // exercises it, but downstream session code will.
      store.watchPrivateKey = bytesToBinaryString(new Uint8Array(32).fill(0x07))
      cb({ success: true, pairMsg: result.pairMsg, verifyMsg: result.verifyMsg })
    },
    completePairing(rawResponseBinary, cb) {
      const rawBytes = binaryStringToBytes(rawResponseBinary)
      const result = bleCrypto.completePairing(rawBytes)
      if (!result.success) return cb({ success: false, error: result.error })
      store.vehicleEcPublicKey   = binaryStringToBytes(result.ecKey)
      store.vehicleDoublingsTable = binaryStringToBytes(result.table)
      cb({ success: true })
    },
    syncPool(cb) {
      store.keyPool = new Uint8Array(97 * 3)
      cb({ success: true })
    },
    ...overrides,
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Start a pairing flow, collect states/logs, resolve when done or errored.
 * options.afterStart(ctrl) fires synchronously after ctrl.start() — use it
 * to trigger NFC taps or advance timers before the promise settles.
 */
function runPairing(phone, options = {}) {
  return new Promise((resolve) => {
    const states = []
    const logs   = []
    const ctrl = createPairingController(phone, {
      onState(s) { states.push(s) },
      onLog(msg) { logs.push(msg) },
      onSuccess() { resolve({ success: true, states, logs }) },
      onError(msg) { resolve({ success: false, error: msg, states, logs }) },
    })
    ctrl.start()
    if (options.afterStart) options.afterStart(ctrl)
  })
}

// ─── lifecycle ────────────────────────────────────────────────────────────────

let sim

beforeEach(() => {
  jest.useFakeTimers()

  Object.keys(_fsStore).forEach(k => delete _fsStore[k])
  store.reset()

  sim = new CarSimulator()
  bleHarness.reset()
  bleHarness.setSimulator(sim)
  teslaBLE.reset()

  // pairing.js always scans by VIN-derived local name (Tesla rotates MAC every
  // ~15 min). Provide VIN + auto-emit a matching beacon so scan resolves
  // immediately. store.vehicleMac is just a cache hint now; pairing ignores it.
  store.vehicleMac = 'AA:BB:CC:DD:EE:FF'
  store.vehicleVin = bytesToBinaryString(sim.vin)
  bleHarness.setScanAutoEmit({
    name: computeTeslaBLEName(store.vehicleVin),
    mac: 'AA:BB:CC:DD:EE:FF',
  })
})

afterEach(() => {
  jest.useRealTimers()
  teslaBLE.reset()
})

// ─── auto-tap flow ────────────────────────────────────────────────────────────

describe('auto-tap pairing (UNKNOWN_KEY response, no NFC wait)', () => {
  test('completes successfully end-to-end', async () => {
    sim.setPairingAutoTap(true)
    const promise = runPairing(makePhone())
    await jest.runAllTimersAsync()
    const result = await promise

    expect(result.success).toBe(true)
  })

  test('visits expected states in order', async () => {
    sim.setPairingAutoTap(true)
    const promise = runPairing(makePhone())
    await jest.runAllTimersAsync()
    const { states } = await promise

    expect(states).toContain('setup')
    expect(states).toContain('connecting')
    expect(states).toContain('pairing')
    expect(states).toContain('verifying')
    expect(states).toContain('done')
    // done must be last
    expect(states[states.length - 1]).toBe('done')
  })

  test('stores 65-byte vehicle EC public key in store', async () => {
    sim.setPairingAutoTap(true)
    const promise = runPairing(makePhone())
    await jest.runAllTimersAsync()
    await promise

    expect(store.vehicleEcPublicKey).toBeInstanceOf(Uint8Array)
    expect(store.vehicleEcPublicKey.length).toBe(65)
    expect(store.vehicleEcPublicKey[0]).toBe(0x04)  // uncompressed EC point
  })

  test('vehicle EC key extracted matches simulator vehiclePubKey', async () => {
    sim.setPairingAutoTap(true)
    const promise = runPairing(makePhone())
    await jest.runAllTimersAsync()
    await promise

    expect(Array.from(store.vehicleEcPublicKey)).toEqual(Array.from(sim.vehiclePubKey))
  })

  test('stores doublings table after pairing', async () => {
    sim.setPairingAutoTap(true)
    const promise = runPairing(makePhone())
    await jest.runAllTimersAsync()
    await promise

    expect(store.vehicleDoublingsTable).toBeDefined()
    // store keeps Uint32Array: 256 entries × 16 words = 4096 elements
    expect(store.vehicleDoublingsTable.length).toBe(4096)
  })

  test('simulator records the enrolled watch public key', async () => {
    sim.setPairingAutoTap(true)
    const promise = runPairing(makePhone())
    await jest.runAllTimersAsync()
    await promise

    // The simulator extracted the watch public key from the pair message
    expect(sim._enrolledPublicKey).toBeInstanceOf(Uint8Array)
    expect(sim._enrolledPublicKey.length).toBe(65)
  })
})

// ─── manual NFC tap flow ──────────────────────────────────────────────────────

describe('manual NFC tap flow (WAIT → tap → OK)', () => {
  test('enters confirming state while waiting for NFC', async () => {
    // no auto-tap: car sends WAIT
    const states = []
    let ctrl
    const promise = new Promise((resolve) => {
      ctrl = createPairingController(makePhone(), {
        onState(s) { states.push(s) },
        onLog() {},
        onSuccess() { resolve({ success: true, states }) },
        onError(msg) { resolve({ success: false, error: msg, states }) },
      })
      ctrl.start()
    })

    // Flush scan auto-emit (setTimeout 0), 500ms post-scan delay, 20ms chunk
    // pacing, and message reassembly so the pair WAIT response is delivered
    // before NFC tap fires. 800ms is safely below the 60s NFC timeout and
    // the doVerify 500ms timer that only runs after OK.
    await jest.advanceTimersByTimeAsync(800)
    expect(states).toContain('confirming')
    expect(sim._pairingPending).toBe(true)

    // Simulate NFC tap
    sim.triggerNFCTap()
    // OK response → doVerify queued (500ms timer)
    await jest.runAllTimersAsync()

    const result = await promise
    expect(result.success).toBe(true)
    expect(result.states).toContain('confirming')
    expect(result.states).toContain('verifying')
    expect(result.states).toContain('done')
  })

  test('succeeds and stores artifacts after NFC tap', async () => {
    let ctrl
    const promise = new Promise((resolve) => {
      ctrl = createPairingController(makePhone(), {
        onState() {},
        onLog() {},
        onSuccess() { resolve({ success: true }) },
        onError(msg) { resolve({ success: false, error: msg }) },
      })
      ctrl.start()
    })

    // Flush scan 500ms post-scan delay + chunk pacing so the pair WAIT response
    // is delivered and pairing is in waitForNFC before the simulated tap.
    await jest.advanceTimersByTimeAsync(800)
    sim.triggerNFCTap()
    await jest.runAllTimersAsync()
    const result = await promise

    expect(result.success).toBe(true)
    expect(store.vehicleEcPublicKey).toBeInstanceOf(Uint8Array)
    expect(store.vehicleEcPublicKey.length).toBe(65)
  })
})

// ─── ambient responses in verify ─────────────────────────────────────────────

describe('ambient responses before verify WEI', () => {
  test('skips 1 ambient and still completes pairing', async () => {
    sim.setPairingAutoTap(true)
    sim.setAmbientCount(1)

    const promise = runPairing(makePhone())
    await jest.runAllTimersAsync()
    const result = await promise

    expect(result.success).toBe(true)
    expect(result.states).toContain('done')
  })

  test('skips 2 consecutive ambients and still completes pairing', async () => {
    sim.setPairingAutoTap(true)
    sim.setAmbientCount(2)

    const promise = runPairing(makePhone())
    await jest.runAllTimersAsync()
    const result = await promise

    expect(result.success).toBe(true)
    expect(store.vehicleEcPublicKey).toBeInstanceOf(Uint8Array)
  })

  test('5 ambients: WEI lands at attempt=5, pairing still succeeds', async () => {
    // doVerify skips ambients while attempt < 5 (attempts 0..4 skip).
    // With 5 ambients the WEI arrives at attempt=5 and is parsed successfully.
    sim.setPairingAutoTap(true)
    sim.setAmbientCount(5)

    const promise = runPairing(makePhone())
    await jest.runAllTimersAsync()
    const result = await promise

    expect(result.success).toBe(true)
  })

  test('6 ambients: attempt 5 is NOT skipped, completePairing fails on ambient bytes', async () => {
    sim.setPairingAutoTap(true)
    sim.setAmbientCount(6)  // 6 ambients; WEI follows but never reached

    const promise = runPairing(makePhone())
    await jest.runAllTimersAsync()
    const result = await promise

    expect(result.success).toBe(false)
  })
})

// ─── error paths ──────────────────────────────────────────────────────────────

describe('error paths', () => {
  test('onError called when pairSetup fails', async () => {
    const phone = makePhone({
      pairSetup(cb) { cb({ success: false, error: 'keygen failed' }) },
    })
    const promise = runPairing(phone)
    await jest.runAllTimersAsync()
    const result = await promise

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/keygen failed/i)
    expect(result.states).toContain('setup')
  })

  test('onError called when whitelist operation returns error', async () => {
    sim.injectPairingError(5)  // wlFault = 5 (no permission)

    const promise = runPairing(makePhone())
    await jest.runAllTimersAsync()
    const result = await promise

    expect(result.success).toBe(false)
    expect(result.states).toContain('pairing')
    expect(result.states).not.toContain('done')
  })

  test('onError called when completePairing fails', async () => {
    sim.setPairingAutoTap(true)
    const phone = makePhone({
      completePairing(_raw, cb) { cb({ success: false, error: 'parse error' }) },
    })

    const promise = runPairing(phone)
    await jest.runAllTimersAsync()
    const result = await promise

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/parse error/i)
  })

  test('onError called when BLE connection fails', async () => {
    // Simulate connection failure by replacing connect on teslaBLE
    const origConnect = teslaBLE.connect.bind(teslaBLE)
    teslaBLE.connect = (_mac, cb) => cb({ success: false, error: 'rfcomm error' })

    const promise = runPairing(makePhone())
    await jest.runAllTimersAsync()
    const result = await promise

    teslaBLE.connect = origConnect
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/rfcomm error|connection failed/i)
  })
})

// ─── NFC timeout ──────────────────────────────────────────────────────────────

describe('NFC tap timeout', () => {
  test('onError called when NFC card is never tapped (60s timeout)', async () => {
    // no auto-tap: car sends WAIT, controller enters waitForNFC(60s)
    const promise = runPairing(makePhone())

    // WAIT delivered synchronously — now in waitForNFC with a 60s timer
    // Advance past the 60s NFC timeout
    await jest.advanceTimersByTimeAsync(61000)

    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/NFC tap timeout/i)
    expect(result.states).toContain('confirming')
  })
})

// ─── ok-without-tap (auto-approved) ──────────────────────────────────────────

describe('ok-without-tap (auto-approved key)', () => {
  test('proceeds to verify instead of looping when waitForNFC receives ok with no prior WAIT', async () => {
    // Flow:
    //   1. doPair sendAndWaitForResponse → car sends OK immediately (no WAIT, no hasSigner)
    //      → sawTapRequired=false, hasSigner=false → doPair enters else → waitForNFC(60s)
    //   2. Car pushes a second OK → waitForNFC callback fires
    //      → BEFORE FIX: loops waitForNFC() forever
    //      → AFTER FIX:  calls doVerify() → pairing completes
    //
    // Two responses must differ in byte length to avoid ble-native frame-sig dedup.
    const ok1 = encodeBytes(4, encodeBytes(3, encodeVarintField(1, 0)))
    // ok2 adds operationStatus=0 at field 1 — same semantic, different byte count
    const { concat } = await import('../lib/tesla-ble/protocol/protobuf.js')
    const ok2 = encodeBytes(4, concat(encodeVarintField(1, 0), encodeBytes(3, encodeVarintField(1, 0))))

    sim._handleWhitelistAdd = (_wlOpBytes, harness) => {
      sim._deliver(harness, ok1)  // → doPair else → waitForNFC registered
      sim._deliver(harness, ok2)  // → waitForNFC callback → ok-skip fixed path → doVerify
    }

    const promise = runPairing(makePhone())
    await jest.runAllTimersAsync()
    const result = await promise

    expect(result.success).toBe(true)
    expect(result.states).toContain('verifying')
    expect(result.states).toContain('done')
  })
})

// ─── cancel ───────────────────────────────────────────────────────────────────

describe('cancel()', () => {
  test('cancel before NFC tap prevents onSuccess from firing', async () => {
    // no auto-tap: car sends WAIT, we're in waitForNFC
    let successFired = false
    let ctrl
    new Promise((resolve) => {
      ctrl = createPairingController(makePhone(), {
        onState() {},
        onLog() {},
        onSuccess() { successFired = true; resolve() },
        onError() { resolve() },
      })
      ctrl.start()
    })

    // WAIT received synchronously; now cancel before NFC tap
    ctrl.cancel()

    // Advance all timers — nothing should fire after cancel
    await jest.runAllTimersAsync()

    expect(successFired).toBe(false)
  })

  test('cancel during scan stops scan (no errors thrown)', () => {
    store.vehicleMac = null  // force scan path
    let ctrl
    expect(() => {
      ctrl = createPairingController(makePhone(), {
        onState() {},
        onLog() {},
        onSuccess() {},
        onError() {},
      })
      ctrl.start()
      ctrl.cancel()
    }).not.toThrow()
  })
})

// ─── BLE scan path ────────────────────────────────────────────────────────────

describe('BLE scan path', () => {
  beforeEach(() => {
    sim.setPairingAutoTap(true)
  })

  test('finds vehicle, connects and completes pairing', async () => {
    // Auto-emit from beforeEach surfaces a matching beacon → scan resolves,
    // pairing dials the discovered MAC and completes.
    const promise = runPairing(makePhone())

    await jest.runAllTimersAsync()
    const result = await promise

    expect(result.success).toBe(true)
    expect(result.states).toContain('scanning')
    expect(result.states).toContain('connecting')
    expect(result.states).toContain('done')
    // Tesla protocol requires the long-term enrolled keypair on the watch for
    // session establishment (SessionInfoRequest identity + ECDH). Pair must
    // persist BOTH halves before completing or the next session attempt fails
    // with KEY_NOT_ON_WHITELIST. See project_amazla_key_session_long_term_key.
    expect(store.watchPublicKey).toBeTruthy()
    expect(store.watchPublicKey.length).toBe(65)
    expect(store.watchPrivateKey).toBeTruthy()
    expect(store.watchPrivateKey.length).toBe(32)
    // On real device the main page auto-syncs the key pool on open
    // (`page/index.js: if (store.keyPoolCount < 10) phone.syncPool()`), so by
    // the time the user reaches the BLE debug page to pair, the pool is
    // already populated. Mimic that here so the post-pair isPaired check
    // reflects real-device state.
    await new Promise((resolve) => makePhone().syncPool(resolve))
    expect(store.isPaired).toBe(true)
  })

  test('reports error when no vehicle found within scan timeout', async () => {
    // Clear auto-emit so the scan callback never receives a device.
    bleHarness.setScanAutoEmit(null)

    const promise = runPairing(makePhone())

    // 15s pairing scan + 500ms ble.js safety pad
    await jest.advanceTimersByTimeAsync(16000)
    const result = await promise

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no tesla found/i)
    expect(result.states).toContain('scanning')
  })
})

