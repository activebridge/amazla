/**
 * TeslaSession edge-case tests — focused on session.js behavior.
 *
 * Uses the BLE harness + CarSimulator helpers only to produce realistic
 * transport + crypto fixtures. The assertions target session.js state
 * transitions and error paths, not end-to-end protocol behavior (which is
 * covered in car-simulator.test.js).
 */

import { jest } from '@jest/globals'
import { TeslaSession } from '../lib/tesla-ble/session.js'
import teslaBLE from '../lib/tesla-ble/ble.js'
import store from '../lib/store.js'
import { concat, encodeBytes, encodeVarintField, decodeMessage } from '../lib/tesla-ble/protocol/protobuf.js'
import { bootSessionEnv, p } from './helpers/session-setup.js'

describe('TeslaSession edge cases', () => {
  test('_buildHMACTag throws when _cmdHmacFn not initialized', () => {
    const s = new TeslaSession()
    s._cmdHmacFn = null
    expect(() => s._buildHMACTag(new Uint8Array(), 0, 0, new Uint8Array())).toThrow(/Command HMAC not initialized/)
  })
})

describe('TeslaSession unexpected link loss (_handleLinkDown)', () => {
  // Device 2026-07-13: a car-side drop surfaced only via a LATE native connect
  // callback; nothing reset the session, so the widget stayed "Connected" on a
  // dead link and every tap failed silently. The ble layer now fires onLinkDown;
  // the session must reset itself and notify the facade observer.
  test('established session: resets and notifies the facade observer', () => {
    const s = new TeslaSession()
    s.established = true
    let notified = 0
    s.onLinkDown(() => notified++)
    s._handleLinkDown()
    expect(s.established).toBe(false)
    expect(notified).toBe(1)
  })

  test('not established: no-op (mid-connect drops are the connect path\'s job)', () => {
    const s = new TeslaSession()
    let notified = 0
    s.onLinkDown(() => notified++)
    s._handleLinkDown()
    expect(notified).toBe(0)
  })

  test('observer survives reset() so a reconnect keeps the facade wired', () => {
    const s = new TeslaSession()
    let notified = 0
    s.onLinkDown(() => notified++)
    s.reset()
    s.established = true
    s._handleLinkDown()
    expect(notified).toBe(1)
  })
})

describe('ensureSessionEstablished — connect-cycle generation guard', () => {
  // Device crash 2026-07-13 (secondary widget): onPause reset() mid-connect, then
  // a resume started a NEW connect; the ORPHANED first completion consumed and
  // nulled the new cycle's pendingCallbacks → "forEach of null" right after
  // "✓ Established". A stale completion must be dropped, not settle a cycle it
  // doesn't own.
  const boot = (s) => {
    // Capture requestSessionInfo completions instead of touching BLE.
    const completions = []
    s.requestSessionInfo = (cb) => completions.push(cb)
    return completions
  }

  test('reset() mid-connect: the orphaned completion is dropped without throwing', () => {
    const s = new TeslaSession()
    jest.spyOn(store, 'isEnrolled', 'get').mockReturnValue(true)
    const completions = boot(s)
    const results = []
    s.ensureSessionEstablished((r) => results.push(r))
    s.reset() // widget onPause teardown while connecting
    expect(() => completions[0]({ success: true })).not.toThrow()
    expect(results.length).toBe(0) // caller was torn down — never settled late
  })

  test('old completion cannot clobber a newer connect cycle', () => {
    const s = new TeslaSession()
    jest.spyOn(store, 'isEnrolled', 'get').mockReturnValue(true)
    const completions = boot(s)
    const first = []
    const second = []
    s.ensureSessionEstablished((r) => first.push(r))
    s.reset() // teardown, then user re-enters the widget
    s.ensureSessionEstablished((r) => second.push(r))
    completions[0]({ success: false, error: 'stale' }) // orphan fires late
    expect(second.length).toBe(0) // new cycle untouched
    completions[1]({ success: true }) // the cycle that owns the callbacks settles it
    expect(second.length).toBe(1)
    expect(second[0].success).toBe(true)
    expect(first.length).toBe(0)
  })
})

describe('TeslaSession ambient-only watchdog (wedged BLE link recovery)', () => {
  // When a SessionInfoRequest gets only ambient (fields:[3]) and no real
  // SessionInfo, the request was likely truncated (dropped write chunk). Tier 0
  // resends on the same link; Tier 1 recycles (disconnect → flush → reconnect);
  // then it gives up.
  let session
  let origDisconnect
  let origFlushNative
  let origIsConnected
  beforeEach(() => {
    bootSessionEnv()
    session = new TeslaSession()
    origDisconnect = teslaBLE.disconnect.bind(teslaBLE)
    origFlushNative = teslaBLE.flushNative.bind(teslaBLE)
    origIsConnected = teslaBLE.isConnected.bind(teslaBLE)
  })
  afterEach(() => {
    teslaBLE.disconnect = origDisconnect
    teslaBLE.flushNative = origFlushNative
    teslaBLE.isConnected = origIsConnected
    session.reset()
    teslaBLE.reset()
  })

  test('Tier 0: timeout with resends remaining → resends on the same link, no teardown', () => {
    teslaBLE.isConnected = () => true
    teslaBLE.disconnect = jest.fn()
    session._doSessionInfoRequest = jest.fn()
    let cbResult = 'NOT_CALLED'
    const cb = (r) => { cbResult = r }

    session._sessionInfoConnects = 1
    session._sessionInfoResends = 0 // resends available
    session._onSessionInfoTimeout(cb)

    expect(session._doSessionInfoRequest).toHaveBeenCalledTimes(1)
    expect(session._doSessionInfoRequest).toHaveBeenCalledWith(cb)
    expect(teslaBLE.disconnect).not.toHaveBeenCalled() // same link, no recycle
    expect(session._sessionInfoResends).toBe(1)
    expect(cbResult).toBe('NOT_CALLED')
  })

  test('Tier 1: resends exhausted but connects remain → disconnect + flush, reconnect after settle', () => {
    // Manual setTimeout capture instead of jest.useFakeTimers(): under the ESM
    // vm-modules runner, useRealTimers() fails to restore the global — setTimeout
    // was left undefined and every later connect() in this suite crashed with
    // "setTimeout is not defined". Same pattern as second-response-timeout.test.js.
    const origSetTimeout = global.setTimeout
    let settleCb = null
    global.setTimeout = (fn, _ms) => {
      settleCb = fn
      return 0
    }
    try {
      teslaBLE.isConnected = () => true
      teslaBLE.disconnect = jest.fn()
      teslaBLE.flushNative = jest.fn()
      session._doSessionInfoRequest = jest.fn()
      session._ensureConnected = jest.fn()
      let cbResult = 'NOT_CALLED'
      const cb = (r) => { cbResult = r }

      session._sessionInfoResends = 99 // resends exhausted
      session._sessionInfoConnects = 0 // connections remain
      session._onSessionInfoTimeout(cb)

      expect(session._doSessionInfoRequest).not.toHaveBeenCalled() // not a resend
      expect(teslaBLE.disconnect).toHaveBeenCalledTimes(1)
      expect(teslaBLE.flushNative).toHaveBeenCalledTimes(1)
      expect(session._ensureConnected).not.toHaveBeenCalled() // deferred past settle
      expect(cbResult).toBe('NOT_CALLED')

      expect(settleCb).not.toBeNull() // the settle timer was armed
      settleCb() // fire it
      expect(session._ensureConnected).toHaveBeenCalledTimes(1)
      expect(session._ensureConnected).toHaveBeenCalledWith(cb)
    } finally {
      global.setTimeout = origSetTimeout
    }
  })

  test('everything exhausted → gives up with an actionable error, no resend/reconnect', () => {
    teslaBLE.isConnected = () => true
    teslaBLE.disconnect = jest.fn()
    session._doSessionInfoRequest = jest.fn()
    session._ensureConnected = jest.fn()
    let cbResult = null
    const cb = (r) => { cbResult = r }

    session._sessionInfoResends = 99
    session._sessionInfoConnects = 99
    session._onSessionInfoTimeout(cb)

    expect(session._doSessionInfoRequest).not.toHaveBeenCalled()
    expect(session._ensureConnected).not.toHaveBeenCalled()
    expect(cbResult.success).toBe(false)
    expect(cbResult.error).toMatch(/not responding|wake the car/i)
  })

  test('watchdog is cleared once a real SessionInfo establishes the session', async () => {
    await p((cb) => teslaBLE.connect('AA:BB:CC:DD:EE:FF', cb))
    const result = await p((cb) => session.requestSessionInfo(cb))
    expect(result.success).toBe(true)
    expect(session._sessionInfoTimer).toBeNull()
  })
})

describe('TeslaSession cached session key (skip ECDH)', () => {
  let session
  beforeEach(async () => {
    bootSessionEnv()
    session = new TeslaSession()
    await p((cb) => teslaBLE.connect('AA:BB:CC:DD:EE:FF', cb))
  })
  afterEach(() => {
    session.reset()
    teslaBLE.reset()
  })

  test('first establish derives + caches the key; second reuses it and skips ECDH', async () => {
    expect(store.sessionKey).toBeFalsy()

    const r1 = await p((cb) => session.requestSessionInfo(cb))
    expect(r1.success).toBe(true)
    const cached = store.sessionKey
    expect(cached && cached.length).toBe(16)

    // Fresh session over the same (still-connected) BLE link + same store.
    session.reset()
    const session2 = new TeslaSession()
    const deriveSpy = jest.spyOn(session2, '_deriveAndCacheSessionKey')

    const r2 = await p((cb) => session2.requestSessionInfo(cb))
    expect(r2.success).toBe(true)
    expect(session2.established).toBe(true)
    // Fast path: never asked the phone to derive (no ECDH).
    expect(deriveSpy).not.toHaveBeenCalled()
    session2.reset()
  })

  test('cached key but stored EC pubkey no longer matches SessionInfo → slow path re-derives', async () => {
    await p((cb) => session.requestSessionInfo(cb))
    expect(store.sessionKey && store.sessionKey.length).toBe(16)

    // Simulate a vehicle key change: the stored EC pubkey (and thus the cached
    // session key) no longer matches the pubkey the car returns in SessionInfo,
    // so the fast-path guard must fail and force a fresh phone-side derivation.
    store.vehicleEcPublicKey = new Uint8Array(65).fill(9)
    store.sessionKey = new Uint8Array(16).fill(7)
    session.reset()
    const session2 = new TeslaSession()
    const deriveSpy = jest.spyOn(session2, '_deriveAndCacheSessionKey')

    const r2 = await p((cb) => session2.requestSessionInfo(cb))
    expect(r2.success).toBe(true)
    expect(deriveSpy).toHaveBeenCalled()
    // Re-cached the correct key (overwrote the bogus one).
    expect(store.sessionKey && store.sessionKey.length).toBe(16)
    session2.reset()
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

  test('HMAC verify failure does not establish session (EC may still be written by table rebuild)', async () => {
    // After the EC-from-SessionInfo refactor, _ensureTableForVehiclePub
    // persists the new pubkey + table BEFORE HMAC verification runs — the
    // table is needed to derive the session key that the HMAC verifies. So
    // an unverified response CAN seed store.vehicleEcPublicKey, but the
    // session itself remains unestablished. The security-relevant invariant
    // we keep checking is the latter.
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
    const bogusTag = new Uint8Array(32).fill(0x42)
    const data = concat(encodeBytes(15, si), encodeBytes(13, sim.buildSessionInfoSigData(bogusTag)))
    capturedHandler({ success: true, data })

    const result = await resultPromise
    teslaBLE.send = origSend

    expect(result.success).toBe(false)
    expect(session.established).toBe(false)
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
    const origSendAddressed = teslaBLE.sendAddressed
    teslaBLE.sendAddressed = (message, match, cb) => {
      const faultStatus = concat(
        encodeVarintField(1, 2),  // operationStatus = ERROR
        encodeVarintField(2, 5),  // signedMessageFault = arbitrary nonzero code
      )
      // Address the reply to the command's per-request address (from_destination,
      // field 7 → routing_address field 2), echoed back as to_destination (field 6),
      // so the command's address-routed waiter matches it like a real vehicle reply.
      const fromDest = decodeMessage(message)[7]
      const cmdAddr = fromDest ? decodeMessage(fromDest)[2] : null
      const toDest = encodeBytes(6, encodeBytes(2, cmdAddr))
      const frame = concat(toDest, encodeBytes(12, faultStatus))
      if (match(frame)) cb({ success: true, data: frame })
      return { token: true }
    }
    const result = await p((cb) => session.sendCommand(1 /* LOCK */, cb))
    teslaBLE.sendAddressed = origSendAddressed

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Signed message fault 5/)
    expect(result.response).toBeDefined()
    expect(session._waitingForSecondResponse).toBe(false)
  })
})
