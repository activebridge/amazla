import { TeslaSession } from '../lib/tesla-ble/session.js'
import teslaBLE from '../lib/tesla-ble/ble-native.js'
import { RKE_ACTION_LOCK } from '../lib/tesla-ble/protocol/vcsec.js'
import { encodeVarintField, encodeBytes } from '../lib/tesla-ble/protocol/protobuf.js'
import { createHmac, createSessionHmacs } from '../lib/tesla-ble/crypto/hmac.js'

function makeSessionInfoBytes(counter, clockTime) {
  return [
    encodeVarintField(1, counter),
    encodeBytes(2, new Uint8Array(65).fill(0x04)),
    encodeBytes(3, new Uint8Array(16).fill(0xee)),
    encodeVarintField(4, clockTime),
  ].reduce((a, b) => { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r }, new Uint8Array(0))
}

describe('sendCommand — second response timeout handling', () => {
  test('sets _waitingForSecondResponse then clears it on timeout and invokes callback with error', () => {
    const session = new TeslaSession()
    // Mark session established and populate minimal fields required by buildAuthenticatedCommand
    session.established = true
    session.ephemeralPublicKey = new Uint8Array(65).fill(0x04)
    session.ephemeralPrivateKey = new Uint8Array(32).fill(0x01)
    session.epoch = new Uint8Array(16).fill(0xee)
    session.counter = 0
    session.clockTime = 1000
    session.sessionKey = new Uint8Array(16).fill(0x11)
    session.routingAddress = new Uint8Array(16).fill(0x22)
    { const { hmac } = createHmac(session.sessionKey); session._hmac = hmac; const { cmdHmac } = createSessionHmacs(session.sessionKey); session._cmdHmacFn = cmdHmac; session._cmdHmac = cmdHmac; }

    // Stub BLE send to synchronously deliver only the intermediate ack
    const origSend = teslaBLE.send
    teslaBLE.send = function(_message, cb) {
      // Deliver a SessionInfo-only routable message (no actionStatus)
      const sessionInfoBytes = makeSessionInfoBytes(5, 1234)
      const routable = encodeBytes(3, sessionInfoBytes)
      cb({ success: true, data: routable })
    }

    // Simple spy to record calls (avoid depending on jest.fn in this environment)
    const uiCb = function() { uiCb.calls.push(Array.from(arguments)) }
    uiCb.calls = []
    session.sendCommand(RKE_ACTION_LOCK, uiCb)

    // After first delivery, session should be waiting for second response
    expect(session._waitingForSecondResponse).toBe(true)
    // UI callback should have been invoked once with the intermediate result
    expect(uiCb.calls.length).toBeGreaterThanOrEqual(1)
    const firstArg = uiCb.calls[0][0]
    // session sets _requeue on the intermediate result it passes back
    expect(firstArg && firstArg._requeue).toBe(true)

    // Ensure a timer was scheduled for the second response
    expect(session._secondResponseTimer).toBeDefined()

    // Simulate disconnect/reset path that should clear the waiting state and timer
    session.reset()
    expect(session._waitingForSecondResponse).toBe(false)
    expect(session._secondResponseTimer).toBeNull()

    // Restore
    teslaBLE.send = origSend
  })

  test('second-response timer expires and invokes callback with error (simulated timer)', () => {
    const session = new TeslaSession()
    session.established = true
    session.ephemeralPublicKey = new Uint8Array(65).fill(0x04)
    session.ephemeralPrivateKey = new Uint8Array(32).fill(0x01)
    session.epoch = new Uint8Array(16).fill(0xee)
    session.counter = 0
    session.clockTime = 1000
    session.sessionKey = new Uint8Array(16).fill(0x11)
    session.routingAddress = new Uint8Array(16).fill(0x22)
    { const { hmac } = createHmac(session.sessionKey); session._hmac = hmac; const { cmdHmac } = createSessionHmacs(session.sessionKey); session._cmdHmacFn = cmdHmac; session._cmdHmac = cmdHmac; }

    // Stub BLE send to deliver only the intermediate SessionInfo response
    const origSend = teslaBLE.send
    teslaBLE.send = function(_message, cb) {
      const sessionInfoBytes = makeSessionInfoBytes(5, 1234)
      const routable = encodeBytes(3, sessionInfoBytes)
      cb({ success: true, data: routable })
    }

    // Intercept global setTimeout so the scheduled timer can be invoked synchronously
    const origSetTimeout = global.setTimeout
    let capturedTimer = null
    global.setTimeout = function(fn, ms) { capturedTimer = fn; return 'captured' }

    const uiCb = function() { uiCb.calls.push(Array.from(arguments)) }
    uiCb.calls = []
    session.sendCommand(RKE_ACTION_LOCK, uiCb)

    // First callback should be the intermediate requeue
    expect(uiCb.calls.length).toBeGreaterThanOrEqual(1)
    const first = uiCb.calls[0][0]
    expect(first && first._requeue).toBe(true)
    expect(session._waitingForSecondResponse).toBe(true)
    expect(capturedTimer).not.toBeNull()

    // Invoke the captured timer to simulate timeout expiry
    capturedTimer()

    // Now the session should clear waiting state and callback called with error
    expect(session._waitingForSecondResponse).toBe(false)
    expect(session._secondResponseTimer).toBeNull()

    // Final callback should be an error from the timeout path
    expect(uiCb.calls.length).toBeGreaterThanOrEqual(2)
    const last = uiCb.calls[uiCb.calls.length - 1][0]
    expect(last && last.success).toBe(false)
    expect(last && last.error).toMatch(/Second response timeout/)

    // Restore
    teslaBLE.send = origSend
    global.setTimeout = origSetTimeout
  })
})

