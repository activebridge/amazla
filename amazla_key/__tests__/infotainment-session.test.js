// Infotainment (domain 3) session flow — reply filtering + per-domain key.
//
// Device captures 2026-06-11:
// 1. After TX SessionInfo(d3), the first frame on the characteristic was an
//    unsolicited VCSEC push (AppDeviceInfoRequest, 13B), not the domain-3 reply.
//    The INF flow consumed it as its response → "no sessionInfo" → command never
//    sent, while the real 177B d3 reply arrived ~1s later, unclaimed.
// 2. With filtering fixed, the car rejected the AES-GCM command with
//    MESSAGEFAULT_ERROR_INVALID_SIGNATURE(5): domain 3 is a different ECU with
//    its OWN EC key pair, so the VCSEC-derived session key is only valid when
//    the d3 SessionInfo pubkey matches VCSEC's.
import { jest } from '@jest/globals'
import { TeslaSession } from '../lib/tesla-ble/session.js'
import teslaBLE from '../lib/tesla-ble/ble.js'
import store from '../lib/store.js'
import { decodeMessage, encodeBytes, encodeVarintField } from '../lib/tesla-ble/protocol/protobuf.js'
import { buildSessionInfoHmacInput } from '../lib/tesla-ble/protocol/vcsec.js'
import { createSessionInfoHmac, createSessionHmacs } from '../lib/tesla-ble/crypto/hmac.js'
import { hexToBytes } from '../lib/tesla-ble/crypto/binary-utils.js'

const concatBytes = (...parts) =>
  parts.reduce((a, b) => { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r }, new Uint8Array(0))

// Verbatim 13-byte frame captured on device: to_destination{domain:0},
// from_destination{domain:2 VCSEC}, payload = FromVCSECMessage field 44
// (appDeviceInfoRequest). The push that stole the d3 SessionInfo slot.
const VCSEC_PUSH = hexToBytes('320208003a0208025203e00202')

const SESSION_KEY = new Uint8Array(16).fill(0x11)
const VCSEC_PUB = new Uint8Array(65).fill(0x04)

function makeSessionInfoBytes(counter, clockTime, publicKey = VCSEC_PUB) {
  return concatBytes(
    encodeVarintField(1, counter),
    encodeBytes(2, publicKey),
    encodeBytes(3, new Uint8Array(16).fill(0xee)),
    encodeVarintField(4, clockTime),
  )
}

function makeAddressedRoutable(routingAddress, payload) {
  return concatBytes(
    encodeBytes(6, encodeBytes(2, routingAddress)),
    payload,
  )
}

// Addressed d3 SessionInfo reply with a VALID HMAC tag (the session now
// verifies it with the resolved key before signing the command).
function makeD3SessionReply(routingAddress, requestUuid, key, infoBytes) {
  const vin = store.vehicleVin || new Uint8Array(0)
  const tag = createSessionInfoHmac(key)(buildSessionInfoHmacInput(vin, requestUuid, infoBytes))
  return makeAddressedRoutable(routingAddress, concatBytes(
    encodeBytes(15, infoBytes),
    encodeBytes(13, encodeBytes(6, encodeBytes(1, tag))),
  ))
}

function makeSession() {
  const s = new TeslaSession()
  s.established = true
  s.sessionKey = SESSION_KEY
  s.ephemeralPublicKey = new Uint8Array(65).fill(0x04)
  s.vehiclePublicKey = VCSEC_PUB
  // VCSEC signing prerequisites so getVehicleStatus can run alongside.
  s.epoch = new Uint8Array(16).fill(0xee)
  s.counter = 5
  s.clockTime = 1000
  s.routingAddress = new Uint8Array(16).fill(0x01)
  const { cmdHmac } = createSessionHmacs(s.sessionKey)
  s._cmdHmacFn = cmdHmac
  return s
}

describe('_infotainmentCommand — domain-3 reply filtering and key resolution', () => {
  let origSendMessage, origConnected, sent

  beforeEach(() => {
    sent = []
    origSendMessage = teslaBLE._sendMessage
    origConnected = teslaBLE.connected
    teslaBLE.connected = true
    // Capture the raw RoutableMessage (strip the 2-byte length prefix) so the
    // test can answer to the routing address the session actually generated.
    teslaBLE._sendMessage = function(framed) { sent.push(framed.subarray(2)) }
  })

  afterEach(() => {
    teslaBLE._sendMessage = origSendMessage
    teslaBLE.connected = origConnected
    teslaBLE.responseCallback = null
    store.infotainmentSessionKey = null
    store.infotainmentEcPublicKey = null
  })

  // The session's routing address and uuid ride in from_destination (field 7 →
  // Destination.routing_address field 2) and field 51 of the request it sends.
  const sentRoutingAddress = (frame) => decodeMessage(decodeMessage(frame)[7])[2]
  const sentUuid = (frame) => decodeMessage(frame)[51]
  const deliver = (frame) => teslaBLE.responseCallback({ success: true, data: frame })

  test('skips unsolicited VCSEC pushes, settles on the addressed d3 reply', () => {
    const session = makeSession()
    const results = []
    session.chargePortInfotainment((r) => results.push(r))

    // SessionInfo(d3) request went out.
    expect(sent.length).toBe(1)
    const ra = sentRoutingAddress(sent[0])
    expect(ra.length).toBe(16)
    expect(session._commandInFlight).toBe(true)

    // The device-captured push arrives first — must be skipped (requeued), not settled.
    deliver(VCSEC_PUSH)
    expect(results.length).toBe(0)
    expect(teslaBLE.responseCallback).not.toBeNull() // still listening

    // Addressed d3 reply (pubkey == VCSEC → key reused, tag verifies) →
    // command goes out on the SAME routing address.
    deliver(makeD3SessionReply(ra, sentUuid(sent[0]), SESSION_KEY, makeSessionInfoBytes(5, 1234)))
    expect(results.length).toBe(0)
    expect(sent.length).toBe(2)
    expect(Array.from(sentRoutingAddress(sent[1]))).toEqual(Array.from(ra))

    // Another push interleaves before the command reply — also skipped.
    deliver(VCSEC_PUSH)
    expect(results.length).toBe(0)

    // Addressed command reply settles the request.
    deliver(makeAddressedRoutable(ra, encodeBytes(10, new Uint8Array([0x01]))))
    expect(results.length).toBe(1)
    expect(results[0].success).toBe(true)
    expect(session._commandInFlight).toBe(false)
  })

  test('getChargeState decodes the plaintext carserver Response in field 10', () => {
    const session = makeSession()
    const results = []
    session.getChargeState((r) => results.push(r))

    const ra = sentRoutingAddress(sent[0])
    deliver(makeD3SessionReply(ra, sentUuid(sent[0]), SESSION_KEY, makeSessionInfoBytes(5, 1234)))
    expect(sent.length).toBe(2) // GetChargeState command went out

    // Car replies with a PLAINTEXT carserver Response in field 10 (no encryption):
    // Response{2 vehicleData{3 charge_state{1 charging_state=Charging, 111 range, 114 level}}}
    const range = new Uint8Array(4); new DataView(range.buffer).setFloat32(0, 240.0, true)
    const chargeState = concatBytes(
      encodeBytes(1, encodeBytes(5, new Uint8Array(0))), // charging_state: Charging (oneof field 5)
      concatBytes(new Uint8Array([0xfd, 0x06]), range),  // battery_range (field 111, wire 5)
      encodeVarintField(114, 83),                        // battery_level = 83
    )
    const response = encodeBytes(2, encodeBytes(3, chargeState)) // Response.vehicleData.charge_state
    deliver(makeAddressedRoutable(ra, encodeBytes(10, response)))

    expect(results.length).toBe(1)
    expect(results[0].success).toBe(true)
    expect(results[0].charge.level).toBe(83)
    expect(results[0].charge.range).toBeCloseTo(240.0, 1)
    expect(results[0].charge.state).toBe('Charging')
  })

  test('d3 pubkey differs from VCSEC → uses cached d3 key, not the VCSEC key', () => {
    const d3Pub = new Uint8Array(65).fill(0x07)
    const d3Key = new Uint8Array(16).fill(0x42)
    store.infotainmentEcPublicKey = d3Pub
    store.infotainmentSessionKey = d3Key

    const session = makeSession()
    const results = []
    session.chargePortInfotainment((r) => results.push(r))

    const ra = sentRoutingAddress(sent[0])
    // Reply tag is computed with the d3 key — only resolving the d3 key verifies it.
    deliver(makeD3SessionReply(ra, sentUuid(sent[0]), d3Key, makeSessionInfoBytes(0, 99, d3Pub)))
    expect(results.length).toBe(0)
    expect(sent.length).toBe(2) // command went out → d3 key accepted

    deliver(makeAddressedRoutable(ra, encodeBytes(10, new Uint8Array([0x01]))))
    expect(results[0].success).toBe(true)
  })

  test('SessionInfo tag mismatch (wrong key) fails locally, command never sent', () => {
    const session = makeSession()
    const results = []
    session.chargePortInfotainment((r) => results.push(r))

    const ra = sentRoutingAddress(sent[0])
    // Tag computed with a DIFFERENT key — must be rejected before signing.
    const wrongKey = new Uint8Array(16).fill(0x99)
    deliver(makeD3SessionReply(ra, sentUuid(sent[0]), wrongKey, makeSessionInfoBytes(5, 1234)))
    expect(results.length).toBe(1)
    expect(results[0].success).toBe(false)
    expect(results[0].error).toMatch(/tag mismatch/)
    expect(sent.length).toBe(1) // no command TX'd with a bad key
    expect(session._commandInFlight).toBe(false)
  })

  test('command reply carrying signedMessageStatus fault → failure, not success', () => {
    const session = makeSession()
    const results = []
    session.chargePortInfotainment((r) => results.push(r))

    const ra = sentRoutingAddress(sent[0])
    deliver(makeD3SessionReply(ra, sentUuid(sent[0]), SESSION_KEY, makeSessionInfoBytes(5, 1234)))
    expect(sent.length).toBe(2)

    // Device-captured rejection shape: field 12 = MessageStatus{operationStatus:2
    // ERROR, fault:5 INVALID_SIGNATURE}.
    deliver(makeAddressedRoutable(ra, encodeBytes(12, concatBytes(
      encodeVarintField(1, 2),
      encodeVarintField(2, 5),
    ))))
    expect(results.length).toBe(1)
    expect(results[0].success).toBe(false)
    expect(results[0].error).toMatch(/fault 5/)
  })

  test('addressed reply without sessionInfo fails cleanly (not a hang)', () => {
    const session = makeSession()
    const results = []
    session.chargePortInfotainment((r) => results.push(r))

    const ra = sentRoutingAddress(sent[0])
    deliver(makeAddressedRoutable(ra, new Uint8Array(0)))
    expect(results.length).toBe(1)
    expect(results[0].success).toBe(false)
    expect(session._commandInFlight).toBe(false)
  })

  // Device capture 2026-06-11 15:14: charge port tapped 1ms before the pending
  // getVehicleStatus deadline fired; the deadline's blanket responseCallback
  // clear wiped the just-registered charge-port callback, the 179B d3 reply
  // fell to the idle listener, and the command timed out.
  test('a stale getVehicleStatus deadline does not clobber the charge-port slot', () => {
    jest.useFakeTimers()
    try {
      const session = makeSession()
      const statusResults = []
      session.getVehicleStatus((r) => statusResults.push(r))
      expect(sent.length).toBe(1) // GET_STATUS out

      jest.advanceTimersByTime(1000)
      const infResults = []
      session.chargePortInfotainment((r) => infResults.push(r))
      expect(sent.length).toBe(2) // d3 SessionInfo request — owns the slot now

      // The status deadline fires while the charge-port request is in flight.
      jest.advanceTimersByTime(session.commandTimeoutMs - 999)
      expect(statusResults.length).toBe(1)
      expect(statusResults[0].success).toBe(false)
      expect(teslaBLE.responseCallback).not.toBeNull() // INF registration survived

      // The d3 reply is still delivered to the charge-port flow.
      const ra = sentRoutingAddress(sent[1])
      deliver(makeD3SessionReply(ra, sentUuid(sent[1]), SESSION_KEY, makeSessionInfoBytes(5, 1234)))
      expect(sent.length).toBe(3) // AES-GCM command TX'd
      deliver(makeAddressedRoutable(ra, encodeBytes(10, new Uint8Array([0x01]))))
      expect(infResults.length).toBe(1)
      expect(infResults[0].success).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  test('only pushes arrive → deadline fires, gate released', () => {
    jest.useFakeTimers()
    try {
      const session = makeSession()
      const results = []
      session.chargePortInfotainment((r) => results.push(r))

      deliver(VCSEC_PUSH)
      deliver(VCSEC_PUSH)
      expect(results.length).toBe(0)

      jest.advanceTimersByTime(session.commandTimeoutMs + 1)
      expect(results.length).toBe(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toMatch(/timed out/)
      expect(session._commandInFlight).toBe(false)
    } finally {
      jest.useRealTimers()
    }
  })
})
