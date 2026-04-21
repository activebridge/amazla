/**
 * TeslaSession edge-case tests — focused on session.js behavior.
 *
 * Uses the BLE harness + CarSimulator helpers only to produce realistic
 * transport + crypto fixtures. The assertions target session.js state
 * transitions and error paths, not end-to-end protocol behavior (which is
 * covered in car-simulator.test.js).
 */

import { TeslaSession } from '../lib/tesla-ble/session.js'
import teslaBLE from '../lib/tesla-ble/ble-native.js'
import store from '../lib/store.js'
import { concat, encodeBytes, encodeVarintField } from '../lib/tesla-ble/protocol/protobuf.js'
import { bootSessionEnv, p } from './helpers/session-setup.js'

describe('TeslaSession edge cases', () => {
  test('_buildHMACTag throws when _cmdHmacFn not initialized', () => {
    const s = new TeslaSession()
    s._cmdHmacFn = null
    expect(() => s._buildHMACTag(new Uint8Array(), 0, 0, new Uint8Array())).toThrow(/Command HMAC not initialized/)
  })
})

describe('TeslaSession SessionInfo HMAC verification', () => {
  let sim
  let session

  beforeEach(async () => {
    ;({ sim } = bootSessionEnv())
    session = new TeslaSession()
    // Connect BLE once so requestSessionInfo reaches _doSessionInfoRequest directly.
    await p((cb) => teslaBLE.connect('AA:BB:CC:DD:EE:FF', cb))
  })

  afterEach(() => {
    session.reset()
    teslaBLE.reset()
  })

  test('response with no HMAC tag → rejected, session not established (lines 215-218)', async () => {
    // Deliver SessionInfo bytes (field 15) but no SignatureData (field 13) →
    // response.sessionInfoTag is null → "Unauthenticated SessionInfo" error.
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
    expect(result.error).toMatch(/Unauthenticated SessionInfo/i)
    expect(session.established).toBe(false)
  })

  test('HMAC tag of wrong length → rejected (lines 228-231)', async () => {
    // 16-byte tag instead of 32 → length mismatch short-circuits the compare loop.
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
    const badTag = new Uint8Array(16).fill(0xcd)
    const data = concat(encodeBytes(15, si), encodeBytes(13, sim.buildSessionInfoSigData(badTag)))
    capturedHandler({ success: true, data })

    const result = await resultPromise
    teslaBLE.send = origSend

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Invalid SessionInfo HMAC/i)
    expect(session.established).toBe(false)
  })

  test('HMAC tag bytes forged (correct length) → rejected (lines 235-238)', async () => {
    // Compute the real tag, flip a byte → constant-time compare detects mismatch.
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
    const realTag = sim.signSessionInfo(session.ephemeralPublicKey, session._lastRequestUuid, si)
    const forged = new Uint8Array(realTag)
    forged[0] = forged[0] ^ 0xff
    const data = concat(encodeBytes(15, si), encodeBytes(13, sim.buildSessionInfoSigData(forged)))
    capturedHandler({ success: true, data })

    const result = await resultPromise
    teslaBLE.send = origSend

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Invalid SessionInfo HMAC/i)
    expect(session.established).toBe(false)
  })

  test('unverified pubkey is NOT persisted when HMAC verify fails', async () => {
    // Clear the stored vehicle pubkey so the "fallback save" path is eligible.
    // Response carries a valid-format pubkey but a bogus HMAC tag.
    // Fix ensures store.vehicleEcPublicKey stays null.
    store.vehicleEcPublicKey = null
    // Session was constructed before we cleared the store, so it cached the
    // stored pubkey in this.vehiclePublicKey during proceedWithSession. Null
    // it out so the response-pubkey branch is taken.
    session.vehiclePublicKey = null

    let capturedHandler = null
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => { capturedHandler = cb }

    const resultPromise = p((cb) => session._doSessionInfoRequest(cb))

    const epoch = new Uint8Array(16).fill(0xab)
    // Use sim's real pubkey so ECDH yields a consistent sessionKey — but the
    // tag we send is garbage, so verify must reject.
    const si = concat(
      encodeVarintField(1, 1),
      encodeBytes(2, sim.vehiclePubKey),
      encodeBytes(3, epoch),
      encodeVarintField(4, Math.floor(Date.now() / 1000)),
    )
    const bogusTag = new Uint8Array(32).fill(0x42)
    const data = concat(encodeBytes(15, si), encodeBytes(13, sim.buildSessionInfoSigData(bogusTag)))
    capturedHandler({ success: true, data })

    const result = await resultPromise
    teslaBLE.send = origSend

    expect(result.success).toBe(false)
    expect(store.vehicleEcPublicKey).toBeNull()
  })

  test('verified pubkey IS persisted when store was empty (happy path preserved)', async () => {
    // Baseline: genuine SessionInfo response, HMAC tag correct, store was empty
    // → fix must not regress the fallback-save behavior.
    store.vehicleEcPublicKey = null
    session.vehiclePublicKey = null

    let capturedHandler = null
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => { capturedHandler = cb }

    const resultPromise = p((cb) => session._doSessionInfoRequest(cb))

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
    expect(store.vehicleEcPublicKey).not.toBeNull()
    expect(Array.from(store.vehicleEcPublicKey)).toEqual(Array.from(sim.vehiclePubKey))
  })
})

describe('TeslaSession sendCommand fault paths', () => {
  let session

  beforeEach(async () => {
    bootSessionEnv()
    session = new TeslaSession()
    const r = await p((cb) => session.requestSessionInfo(cb))
    if (!r.success) throw new Error('Session setup failed: ' + r.error)
  })

  afterEach(() => {
    session.reset()
    teslaBLE.reset()
  })

  test('signedMessageStatus with fault code → command rejected (lines 344-347)', async () => {
    // Vehicle responds with RoutableMessage.signed_message_status (field 12)
    // carrying a non-zero signedMessageFault → session.js returns auth-layer fault.
    const origSend = teslaBLE.send.bind(teslaBLE)
    teslaBLE.send = (_msg, cb) => {
      const faultStatus = concat(
        encodeVarintField(1, 2),  // operationStatus = ERROR
        encodeVarintField(2, 5),  // signedMessageFault = arbitrary nonzero code
      )
      cb({ success: true, data: encodeBytes(12, faultStatus) })
    }
    const result = await p((cb) => session.sendCommand(1 /* LOCK */, cb))
    teslaBLE.send = origSend

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Signed message fault 5/)
    expect(result.response).toBeDefined()
    expect(session._waitingForSecondResponse).toBe(false)
  })
})
