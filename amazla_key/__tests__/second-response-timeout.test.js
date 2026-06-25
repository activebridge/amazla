import { TeslaSession } from '../lib/tesla-ble/session.js'
import teslaBLE from '../lib/tesla-ble/ble.js'
import { RKE_ACTION_LOCK } from '../lib/tesla-ble/protocol/vcsec.js'
import { encodeVarintField, encodeBytes, decodeMessage } from '../lib/tesla-ble/protocol/protobuf.js'
import { createHmac, createSessionHmacs } from '../lib/tesla-ble/crypto/hmac.js'

const concatBytes = (...parts) =>
  parts.reduce((a, b) => { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r }, new Uint8Array(0))

function makeSessionInfoBytes(counter, clockTime) {
  return concatBytes(
    encodeVarintField(1, counter),
    encodeBytes(2, new Uint8Array(65).fill(0x04)),
    encodeBytes(3, new Uint8Array(16).fill(0xee)),
    encodeVarintField(4, clockTime),
  )
}

// A real command-response RoutableMessage is addressed to the command's routing
// address via to_destination (field 6 → Destination.routing_address field 2).
// Unsolicited vehicle pushes are NOT, and the session layer must drop those.
function makeAddressedRoutable(routingAddress, payload) {
  return concatBytes(
    encodeBytes(6, encodeBytes(2, routingAddress)),
    payload,
  )
}

// The command builds its RoutableMessage with a per-request from_destination
// (field 7 → Destination.routing_address field 2 = cmdAddr). The car echoes that
// as the reply's to_destination, and the command's address-routed waiter matches on
// it. Tests pull cmdAddr out of the sent message so they can address replies back.
function extractFromAddr(message) {
  const dest = decodeMessage(message)[7]
  return dest ? decodeMessage(dest)[2] : null
}
// Install a sendAddressed stub that delivers `routableFor(cmdAddr)` IF the command's
// matcher accepts it (mirrors ble.js dispatch). Returns a restore fn.
function stubSendAddressed(routableFor) {
  const orig = teslaBLE.sendAddressed
  teslaBLE.sendAddressed = function (message, match, cb) {
    const cmdAddr = extractFromAddr(message)
    const frame = routableFor(cmdAddr)
    if (frame && match(frame)) cb({ success: true, data: frame })
    return { token: true }
  }
  return () => { teslaBLE.sendAddressed = orig }
}

describe('sendCommand — second response timeout handling', () => {
  test('sets _waitingForSecondResponse then clears it on timeout and invokes callback with error', () => {
    const session = new TeslaSession()
    // Mark session established and populate minimal fields required by buildAuthenticatedCommand
    session.established = true
    session.ephemeralPublicKey = new Uint8Array(65).fill(0x04)
    session.epoch = new Uint8Array(16).fill(0xee)
    session.counter = 0
    session.clockTime = 1000
    session.sessionKey = new Uint8Array(16).fill(0x11)
    session.routingAddress = new Uint8Array(16).fill(0x22)
    { const { hmac } = createHmac(session.sessionKey); session._hmac = hmac; const { cmdHmac } = createSessionHmacs(session.sessionKey); session._cmdHmacFn = cmdHmac; session._cmdHmac = cmdHmac; }

    // Deliver only the intermediate SessionInfo push, addressed back to the command's
    // per-request address (cmdAddr) so the waiter accepts it.
    const restore = stubSendAddressed((cmdAddr) =>
      makeAddressedRoutable(cmdAddr, encodeBytes(15, makeSessionInfoBytes(5, 1234))),
    )

    // Simple spy to record calls (avoid depending on jest.fn in this environment)
    const uiCb = function() { uiCb.calls.push(Array.from(arguments)) }
    uiCb.calls = []
    session.sendCommand(RKE_ACTION_LOCK, uiCb)

    // A SessionInfo-only push is non-terminal: the session waits for the action ack and
    // does NOT call the UI callback yet (the waiter stays armed; no _requeue plumbing).
    expect(session._waitingForSecondResponse).toBe(true)
    expect(uiCb.calls.length).toBe(0)

    // Ensure a timer was scheduled for the second response
    expect(session._secondResponseTimer).toBeDefined()

    // Simulate disconnect/reset path that should clear the waiting state and timer
    session.reset()
    expect(session._waitingForSecondResponse).toBe(false)
    expect(session._secondResponseTimer).toBeNull()

    restore()
  })

  test('second-response timer expires and invokes callback with error (simulated timer)', () => {
    const session = new TeslaSession()
    session.established = true
    session.ephemeralPublicKey = new Uint8Array(65).fill(0x04)
    session.epoch = new Uint8Array(16).fill(0xee)
    session.counter = 0
    session.clockTime = 1000
    session.sessionKey = new Uint8Array(16).fill(0x11)
    session.routingAddress = new Uint8Array(16).fill(0x22)
    { const { hmac } = createHmac(session.sessionKey); session._hmac = hmac; const { cmdHmac } = createSessionHmacs(session.sessionKey); session._cmdHmacFn = cmdHmac; session._cmdHmac = cmdHmac; }

    // Deliver only the intermediate SessionInfo response (addressed to cmdAddr)
    const restore = stubSendAddressed((cmdAddr) =>
      makeAddressedRoutable(cmdAddr, encodeBytes(15, makeSessionInfoBytes(5, 1234))),
    )

    // Intercept global setTimeout so the scheduled timer can be invoked synchronously.
    // sendCommand schedules command-deadline + resend timers first, then (on the
    // SessionInfo push) the second-response timer LAST — so capturedTimer is it.
    const origSetTimeout = global.setTimeout
    let capturedTimer = null
    global.setTimeout = function(fn, ms) { capturedTimer = fn; return 'captured' }

    const uiCb = function() { uiCb.calls.push(Array.from(arguments)) }
    uiCb.calls = []
    session.sendCommand(RKE_ACTION_LOCK, uiCb)

    // Non-terminal SessionInfo → waiting, no UI callback yet
    expect(uiCb.calls.length).toBe(0)
    expect(session._waitingForSecondResponse).toBe(true)
    expect(capturedTimer).not.toBeNull()

    // Invoke the captured timer to simulate timeout expiry
    capturedTimer()

    // Now the session should clear waiting state and callback called with error
    expect(session._waitingForSecondResponse).toBe(false)
    expect(session._secondResponseTimer).toBeNull()

    // The single UI callback is the timeout error
    expect(uiCb.calls.length).toBe(1)
    const last = uiCb.calls[uiCb.calls.length - 1][0]
    expect(last && last.success).toBe(false)
    expect(last && last.error).toMatch(/Second response timeout/)

    restore()
    global.setTimeout = origSetTimeout
  })

  test('unsolicited push (not addressed to this command) is dropped, not treated as response', () => {
    const session = new TeslaSession()
    session.established = true
    session.ephemeralPublicKey = new Uint8Array(65).fill(0x04)
    session.epoch = new Uint8Array(16).fill(0xee)
    session.counter = 0
    session.clockTime = 1000
    session.sessionKey = new Uint8Array(16).fill(0x11)
    session.routingAddress = new Uint8Array(16).fill(0x22)
    { const { hmac } = createHmac(session.sessionKey); session._hmac = hmac; const { cmdHmac } = createSessionHmacs(session.sessionKey); session._cmdHmacFn = cmdHmac; session._cmdHmac = cmdHmac; }

    // A push addressed to a DIFFERENT routing address (unsolicited broadcast, like
    // Tesla's periodic VehicleStatus) must NOT match this command's address-routed
    // waiter — the matcher rejects it, so it never reaches the command at all.
    const restore = stubSendAddressed(() =>
      makeAddressedRoutable(new Uint8Array(16).fill(0x99), encodeBytes(15, makeSessionInfoBytes(5, 1234))),
    )

    const uiCb = function() { uiCb.calls.push(Array.from(arguments)) }
    uiCb.calls = []
    session.sendCommand(RKE_ACTION_LOCK, uiCb)

    // Not addressed to us → never delivered to the command; it keeps waiting on the
    // deadline, never marked as a SessionInfo wait, never calls the UI callback.
    expect(session._waitingForSecondResponse).toBe(false)
    expect(uiCb.calls.length).toBe(0)
    // The overall command deadline is still ticking; tear it down so the real timer
    // doesn't leak past the test.
    expect(session._commandTimer).not.toBeNull()
    session.reset()

    restore()
  })

  test('empty FromVCSECMessage (field 10, len 0) addressed to us → terminal success', () => {
    const session = new TeslaSession()
    session.established = true
    session.ephemeralPublicKey = new Uint8Array(65).fill(0x04)
    session.epoch = new Uint8Array(16).fill(0xee)
    session.counter = 0
    session.clockTime = 1000
    session.sessionKey = new Uint8Array(16).fill(0x11)
    session.routingAddress = new Uint8Array(16).fill(0x22)
    { const { hmac } = createHmac(session.sessionKey); session._hmac = hmac; const { cmdHmac } = createSessionHmacs(session.sessionKey); session._cmdHmacFn = cmdHmac; session._cmdHmac = cmdHmac; }

    // Real vehicles ack an RKE action with an EMPTY FromVCSECMessage (field 10,
    // length 0) addressed back to the command's per-request address (cmdAddr) — no
    // commandStatus. Per Tesla SDK (done := commandStatus == nil) that's success, and
    // with address routing the empty ack is unambiguously THIS command's. Must NOT hang.
    const restore = stubSendAddressed((cmdAddr) =>
      makeAddressedRoutable(cmdAddr, encodeBytes(10, new Uint8Array(0))),
    )

    const uiCb = function() { uiCb.calls.push(Array.from(arguments)) }
    uiCb.calls = []
    session.sendCommand(RKE_ACTION_LOCK, uiCb)

    expect(session._waitingForSecondResponse).toBe(false)
    const last = uiCb.calls[uiCb.calls.length - 1][0]
    expect(last.success).toBe(true)
    expect(last._requeue).toBeUndefined()

    restore()
  })
})

