// Session protocol tests: vcsec session builders, SessionInfo parsing, HMAC wiring

import { jest } from '@jest/globals'
import {
  SIGNATURE_TYPE_HMAC_PERSONALIZED,
  RKE_ACTION_LOCK,
  RKE_ACTION_UNLOCK,
  RKE_ACTION_OPEN_TRUNK,
  RKE_ACTION_OPEN_FRUNK,
  RKE_ACTION_WAKE_VEHICLE,
  buildRoutableMessage,
  buildSessionInfoRequest,
  buildClosureMoveRequest,
  buildSignedMessage,
  buildUnsignedMessage,
  buildKeyIdentity,
  buildHMACPersonalizedData,
  buildSignatureData,
  parseSessionInfo,
  parseRoutableMessage,
  generateUUID,
  generateRoutingAddress,
  DOMAIN_VEHICLE_SECURITY,
} from '../lib/tesla-ble/protocol/vcsec.js'
import { decodeMessage, encodeBytes, encodeVarintField, encodeFixed32, concat } from '../lib/tesla-ble/protocol/protobuf.js'
import { TeslaSession } from '../lib/tesla-ble/session.js'
import { createSessionHmacs } from '../lib/tesla-ble/crypto/hmac.js'
import teslaBLE from '../lib/tesla-ble/ble.js'
import { hexToBytes } from '../lib/tesla-ble/crypto/binary-utils.js'
import store from '../lib/store.js'

function bytesToHex(b) {
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
}

function initSessionHmacs(s) {
  const { cmdHmac } = createSessionHmacs(s.sessionKey)
  s._cmdHmacFn = cmdHmac
}

// ── vcsec session builders ──────────────────────────────────────────────────

describe('RKE action constants', () => {
  test('UNLOCK=0, LOCK=1, OPEN_TRUNK=2, OPEN_FRUNK=3 — DO NOT CHANGE', () => {
    expect(RKE_ACTION_UNLOCK).toBe(0)
    expect(RKE_ACTION_LOCK).toBe(1)
    expect(RKE_ACTION_OPEN_TRUNK).toBe(2)
    expect(RKE_ACTION_OPEN_FRUNK).toBe(3)
  })

  test('WAKE_VEHICLE=30 (verified in teslamotors + acvigue protos) — DO NOT CHANGE', () => {
    expect(RKE_ACTION_WAKE_VEHICLE).toBe(30)
  })

  test('SIGNATURE_TYPE_HMAC_PERSONALIZED=8 (signatures.proto SignatureType enum)', () => {
    expect(SIGNATURE_TYPE_HMAC_PERSONALIZED).toBe(8)
  })
})

describe('buildUnsignedMessage — RKE action at field 2', () => {
  test('LOCK at field 2, NOT field 1', () => {
    const msg = buildUnsignedMessage({ rkeAction: RKE_ACTION_LOCK })
    const fields = decodeMessage(msg)
    expect(fields[2]).toBe(RKE_ACTION_LOCK)  // field 2 = RKEAction_E
    expect(fields[1]).toBeUndefined()          // field 1 must be absent (InformationRequest only)
  })

  test('UNLOCK at field 2', () => {
    const msg = buildUnsignedMessage({ rkeAction: RKE_ACTION_UNLOCK })
    expect(decodeMessage(msg)[2]).toBe(RKE_ACTION_UNLOCK)
  })

  test('OPEN_TRUNK at field 2', () => {
    expect(decodeMessage(buildUnsignedMessage({ rkeAction: RKE_ACTION_OPEN_TRUNK }))[2]).toBe(RKE_ACTION_OPEN_TRUNK)
  })
})

// vcsec.proto SignedMessage has ONLY field 2 (payload) and field 3 (signatureType).
// HMAC auth data goes in RoutableMessage.signature_data (field 13), NOT here.
describe('buildSignedMessage — only fields 2 and 3 per vcsec.proto', () => {
  test('encodes payload at field 2', () => {
    const payload = new Uint8Array([0x10, 0x01])
    const msg = buildSignedMessage({ payload })
    const fields = decodeMessage(msg)
    expect(fields[2]).toBeDefined()
    expect(Array.from(fields[2])).toEqual([0x10, 0x01])
  })

  test('encodes signatureType at field 3 when provided', () => {
    const msg = buildSignedMessage({ payload: new Uint8Array([0x01]), signatureType: 2 })
    expect(decodeMessage(msg)[3]).toBe(2)  // PRESENT_KEY = 2
  })

  test('no fields 4-7 (those do not exist in vcsec.proto SignedMessage)', () => {
    const msg = buildSignedMessage({ payload: new Uint8Array([0x01]), signatureType: 2 })
    const fields = decodeMessage(msg)
    expect(fields[4]).toBeUndefined()
    expect(fields[5]).toBeUndefined()
    expect(fields[6]).toBeUndefined()
    expect(fields[7]).toBeUndefined()
  })

  test('authenticated commands omit signatureType (NONE=0 implied by proto3 default)', () => {
    // For HMAC commands, the auth is entirely in RoutableMessage field 13
    const msg = buildSignedMessage({ payload: new Uint8Array([0xaa]) })
    const fields = decodeMessage(msg)
    expect(fields[2]).toBeDefined()      // payload present
    expect(fields[3]).toBeUndefined()    // signatureType absent (proto3 omits default 0)
  })
})

// ── buildSignatureData — HMAC auth structure ──────────────────────────────
// Per signatures.proto: SignatureData { signer_identity(1), HMAC_Personalized_data(8) }
// HMAC_Personalized_Signature_Data { epoch(1), counter(2 uint32), expires_at(3 fixed32 LE), tag(4) }

describe('buildSignatureData — correct HMAC auth structure', () => {
  const epoch   = new Uint8Array(16).fill(0xee)
  const pubKey  = new Uint8Array(65).fill(0x04)
  const tag     = new Uint8Array(32).fill(0xab)
  const counter = 42
  const expiresAt = 1060

  test('field 1 = KeyIdentity containing signer public key', () => {
    const sigData = buildSignatureData(pubKey, epoch, counter, expiresAt, tag)
    const fields = decodeMessage(sigData)
    expect(fields[1]).toBeDefined()
    // KeyIdentity { public_key (field 1) }
    const keyId = decodeMessage(fields[1])
    expect(keyId[1].length).toBe(65)
    expect(keyId[1][0]).toBe(0x04)
  })

  test('field 8 = HMAC_Personalized_data with epoch, counter, expires_at, tag', () => {
    const sigData = buildSignatureData(pubKey, epoch, counter, expiresAt, tag)
    const fields = decodeMessage(sigData)
    expect(fields[8]).toBeDefined()
    const hmacData = decodeMessage(fields[8])
    expect(hmacData[1].length).toBe(16)     // epoch (field 1 bytes)
    expect(hmacData[2]).toBe(42)             // counter (field 2 varint)
    expect(hmacData[3].length).toBe(4)      // expires_at (field 3 fixed32 = 4-byte LE)
    expect(hmacData[4].length).toBe(32)     // tag (field 4 bytes)
  })

  test('expires_at encoded as fixed32 little-endian', () => {
    const sigData = buildSignatureData(pubKey, epoch, counter, 0x01020304, tag)
    const hmacData = decodeMessage(decodeMessage(sigData)[8])
    // fixed32 LE: 0x01020304 → bytes [0x04, 0x03, 0x02, 0x01]
    expect(hmacData[3][0]).toBe(0x04)
    expect(hmacData[3][1]).toBe(0x03)
    expect(hmacData[3][2]).toBe(0x02)
    expect(hmacData[3][3]).toBe(0x01)
  })

  test('buildKeyIdentity alone encodes public key at field 1', () => {
    const keyId = buildKeyIdentity(pubKey)
    expect(decodeMessage(keyId)[1].length).toBe(65)
  })

  test('buildHMACPersonalizedData without tag omits field 4', () => {
    const hmacData = buildHMACPersonalizedData(epoch, counter, expiresAt, null)
    const fields = decodeMessage(hmacData)
    expect(fields[1].length).toBe(16)  // epoch
    expect(fields[2]).toBe(counter)     // counter
    expect(fields[3].length).toBe(4)   // expires_at
    expect(fields[4]).toBeUndefined()   // no tag yet
  })
})

describe('buildRoutableMessage — signatureData at field 13', () => {
  test('signatureData placed at field 13, not field 10 or 14', () => {
    const sigData = buildSignatureData(
      new Uint8Array(65).fill(0x04),
      new Uint8Array(16).fill(0xee),
      1, 1060,
      new Uint8Array(32).fill(0xff)
    )
    const msg = buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      routingAddress: generateRoutingAddress(),
      payload: new Uint8Array([0x01]),
      signatureData: sigData,
      uuid: generateUUID(),
    })
    const fields = decodeMessage(msg)
    expect(fields[13]).toBeDefined()
    expect(fields[10]).toBeDefined()  // payload still present
  })

  test('signatureData absent when not provided', () => {
    const msg = buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      payload: new Uint8Array([0x01]),
      uuid: generateUUID(),
    })
    expect(decodeMessage(msg)[13]).toBeUndefined()
  })
})

describe('buildSessionInfoRequest', () => {
  test('buildClosureMoveRequest sets closure slot field to action enum, placed at field 4 in UnsignedMessage', () => {
    const cmr = buildClosureMoveRequest(5, 3) // rear trunk = OPEN
    const um = buildUnsignedMessage({ closureMoveRequest: cmr })
    const fields = decodeMessage(um)
    // field 4 = closureMoveRequest bytes per vcsec.proto
    expect(fields[4]).toBeDefined()
    const cmrFields = decodeMessage(fields[4])
    // ClosureMoveRequest.rearTrunk (field 5) = CLOSURE_MOVE_TYPE_OPEN (3)
    expect(cmrFields[5]).toBe(3)
  })

  test('charge port closure encodes at ClosureMoveRequest field 7 = OPEN', () => {
    const cmr = buildClosureMoveRequest(7, 3) // chargePort = OPEN
    const um = buildUnsignedMessage({ closureMoveRequest: cmr })
    const cmrFields = decodeMessage(decodeMessage(um)[4])
    // ClosureMoveRequest.chargePort (field 7) = CLOSURE_MOVE_TYPE_OPEN (3)
    expect(cmrFields[7]).toBe(3)
  })

  test('places publicKey at field 1, challenge at field 2', () => {
    const pub       = new Uint8Array(65).fill(0x04)
    const challenge = new Uint8Array(16).fill(0x77)
    const req = buildSessionInfoRequest(pub, challenge)
    const fields = decodeMessage(req)
    expect(fields[1].length).toBe(65)
    expect(fields[2].length).toBe(16)
  })
})

describe('buildRoutableMessage', () => {
  test('to_destination domain at field 6, routing_address at field 7, payload at 10, uuid at 51', () => {
    const routing = generateRoutingAddress()
    const uuid    = generateUUID()
    const payload = new Uint8Array([0x01, 0x02])
    const msg = buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      routingAddress: routing,
      payload,
      uuid,
    })
    const fields = decodeMessage(msg)
    // field 6 = to_destination { 1: domain }
    expect(fields[6]).toBeDefined()
    const dest = decodeMessage(fields[6])
    expect(dest[1]).toBe(DOMAIN_VEHICLE_SECURITY)
    // field 7 = from_destination { 2: routing_address }
    expect(fields[7]).toBeDefined()
    const fromDest = decodeMessage(fields[7])
    expect(fromDest[2].length).toBe(16)
    // field 10 = payload
    expect(Array.from(fields[10])).toEqual([0x01, 0x02])
    // field 51 = uuid (vehicle uses this as SessionInfo HMAC challenge)
    expect(fields[51].length).toBe(16)
  })

  test('sessionInfoRequest goes at field 14', () => {
    const pub = new Uint8Array(65).fill(0x04)
    const req = buildSessionInfoRequest(pub, generateUUID())
    const msg = buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      routingAddress: generateRoutingAddress(),
      sessionInfoRequest: req,
      uuid: generateUUID(),
    })
    const fields = decodeMessage(msg)
    expect(fields[14]).toBeDefined()
    expect(fields[10]).toBeUndefined() // no payload
  })
})

describe('parseSessionInfo', () => {
  test('parses counter, publicKey, epoch, clockTime from encoded bytes', () => {
    const counter = 7
    const pub    = new Uint8Array(65).fill(0x04)
    const epoch  = new Uint8Array(16).fill(0xab)
    const encoded = [
      encodeVarintField(1, counter),
      encodeBytes(2, pub),
      encodeBytes(3, epoch),
      encodeVarintField(4, 9999),
    ].reduce((a, b) => { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r }, new Uint8Array(0))

    const info = parseSessionInfo(encoded)
    expect(info.counter).toBe(counter)
    expect(info.publicKey.length).toBe(65)
    expect(info.epoch.length).toBe(16)
    expect(info.clockTime).toBe(9999)
  })

  // Real vehicles encode clock_time (and counter) as fixed32 (wire type 5),
  // not varint — decoder hands back 4 LE bytes. Parsing must read the uint32,
  // not fall back to 0. clock_time=0 made expires_at always-in-the-past →
  // every command rejected with MESSAGEFAULT_ERROR_TIME_EXPIRED (17).
  test('parses clock_time sent as fixed32 (LE bytes), not just varint', () => {
    const encoded = [
      encodeBytes(2, new Uint8Array(65).fill(0x04)),
      encodeBytes(3, new Uint8Array(16).fill(0xab)),
      encodeFixed32(4, 542),   // wire-type-5 clock_time, as the car sends it
    ].reduce((a, b) => { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r }, new Uint8Array(0))

    const info = parseSessionInfo(encoded)
    expect(info.clockTime).toBe(542)
  })
})

function makeSessionInfoBytes(counter, clockTime) {
  return [
    encodeVarintField(1, counter),
    encodeBytes(2, new Uint8Array(65).fill(0x04)),
    encodeBytes(3, new Uint8Array(16).fill(0xee)),
    encodeVarintField(4, clockTime),
  ].reduce((a, b) => { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r }, new Uint8Array(0))
}

describe('parseRoutableMessage', () => {
  test('extracts payload (field 10) and sessionInfo (field 15)', () => {
    const innerPayload = new Uint8Array([0x01, 0x02, 0x03])
    const sessionInfoBytes = makeSessionInfoBytes(5, 1234)

    const encoded = [
      encodeBytes(15, sessionInfoBytes),
      encodeBytes(10, innerPayload),
    ].reduce((a, b) => { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r }, new Uint8Array(0))

    const parsed = parseRoutableMessage(encoded)
    expect(Array.from(parsed.payload)).toEqual([0x01, 0x02, 0x03])
    expect(parsed.sessionInfo).not.toBeNull()
    expect(parsed.sessionInfo.counter).toBe(5)
    expect(parsed.sessionInfo.clockTime).toBe(1234)
  })

  test('returns null sessionInfo when field 15 absent', () => {
    const msg = encodeBytes(10, new Uint8Array([0xaa]))
    const parsed = parseRoutableMessage(msg)
    expect(parsed.sessionInfo).toBeNull()
  })

  test('intermediate ack (field 1 only) has null sessionInfo, payload, and signedMessageStatus', () => {
    // This is the first response the vehicle sends to a session info request —
    // an intermediate ack containing only the routing address (field 1).
    // The handler must detect this (all three null) and re-register instead of failing.
    // Matches the real bytes seen in logs: 0a0a18012002380142020801
    const intermediateAck = new Uint8Array([
      0x0a, 0x0a, 0x18, 0x01, 0x20, 0x02, 0x38, 0x01, 0x42, 0x02, 0x08, 0x01
    ])
    const parsed = parseRoutableMessage(intermediateAck)
    expect(parsed.sessionInfo).toBeNull()
    expect(parsed.payload).toBeNull()
    expect(parsed.signedMessageStatus).toBeNull()
    // actionStatus (field 1) IS present — that's the routing info in the ack
    expect(parsed.actionStatus).not.toBeNull()
  })

  test('intermediate ack condition: !sessionInfo && !payload && !signedMessageStatus', () => {
    // Verifies the exact boolean condition used in _doSessionInfoRequest to detect
    // intermediate acks and keep the callback alive.
    const intermediateAck = new Uint8Array([
      0x0a, 0x0a, 0x18, 0x01, 0x20, 0x02, 0x38, 0x01, 0x42, 0x02, 0x08, 0x01
    ])
    const parsed = parseRoutableMessage(intermediateAck)
    const isIntermediateAck = !parsed.sessionInfo && !parsed.payload && !parsed.signedMessageStatus
    expect(isIntermediateAck).toBe(true)
  })

  test('real SessionInfo response (field 15) does NOT trigger intermediate ack condition', () => {
    const sessionInfoBytes = makeSessionInfoBytes(7, 9999)
    const encoded = encodeBytes(15, sessionInfoBytes)
    const parsed = parseRoutableMessage(encoded)
    const isIntermediateAck = !parsed.sessionInfo && !parsed.payload && !parsed.signedMessageStatus
    expect(isIntermediateAck).toBe(false)
    expect(parsed.sessionInfo).not.toBeNull()
  })
})

describe('generateRoutingAddress', () => {
  test('returns 16 bytes', () => {
    expect(generateRoutingAddress().length).toBe(16)
  })

  test('generates unique addresses', () => {
    const a = generateRoutingAddress()
    const b = generateRoutingAddress()
    expect(bytesToHex(a)).not.toBe(bytesToHex(b))
  })
})

// ── loadDoublingsTable parsing ─────────────────────────────────────────────
// Tests the parsing logic in isolation (no storage dependency).

describe('loadDoublingsTable parsing logic', () => {
  // Mirror the logic from session.js loadDoublingsTable for unit testing.
  // Storage format: binary string, 16384 chars (256 entries × 64 bytes each).
  // Output: flat Uint32Array(256×16), LSW-first (matches bytesToU256 in p256.js).
  // vehiclePublicKey: optional Uint8Array[65] (uncompressed: 04 || x[32] || y[32])
  function parseDoublingsTable(data, vehiclePublicKey = null) {
    if (!data || data.length !== 16384) return null
    if (vehiclePublicKey && vehiclePublicKey.length === 65) {
      for (let i = 0; i < 32; i++) {
        if ((data.charCodeAt(i) & 0xff) !== vehiclePublicKey[1 + i] ||
            (data.charCodeAt(32 + i) & 0xff) !== vehiclePublicKey[33 + i]) return null
      }
    }
    const table = new Uint32Array(256 * 16)
    for (let i = 0; i < 256; i++) {
      const base = i * 64
      const tbase = i * 16
      for (let j = 0; j < 8; j++) {
        const xo = base + 28 - j * 4
        table[tbase + j] = (((data.charCodeAt(xo)   & 0xff) << 24) |
                             ((data.charCodeAt(xo+1) & 0xff) << 16) |
                             ((data.charCodeAt(xo+2) & 0xff) <<  8) |
                              (data.charCodeAt(xo+3) & 0xff)) >>> 0
        const yo = base + 32 + 28 - j * 4
        table[tbase + 8 + j] = (((data.charCodeAt(yo)   & 0xff) << 24) |
                                 ((data.charCodeAt(yo+1) & 0xff) << 16) |
                                 ((data.charCodeAt(yo+2) & 0xff) <<  8) |
                                  (data.charCodeAt(yo+3) & 0xff)) >>> 0
      }
    }
    return table
  }

  function makeTableBinary(entries) {
    // entries: array of 256 {x: Uint8Array[32], y: Uint8Array[32]}
    const raw = new Uint8Array(256 * 64)
    for (let i = 0; i < 256; i++) {
      raw.set(entries[i].x, i * 64)
      raw.set(entries[i].y, i * 64 + 32)
    }
    let s = ''
    for (let i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i])
    return s
  }

  const DUMMY_ENTRIES = Array.from({ length: 256 }, (_, i) => ({
    x: new Uint8Array(32).fill(i & 0xff),
    y: new Uint8Array(32).fill((i + 1) & 0xff),
  }))

  test('valid hex (32768 chars) parses to 256 entries', () => {
    const table = parseDoublingsTable(makeTableBinary(DUMMY_ENTRIES))
    expect(table).not.toBeNull()
    expect(table.length).toBe(256 * 16)
  })

  test('each entry is [Uint32Array(8), Uint32Array(8)]', () => {
    const table = parseDoublingsTable(makeTableBinary(DUMMY_ENTRIES))
    // flat format: entry i at [i*16..i*16+15], all uint32 values
    expect(table).toBeInstanceOf(Uint32Array)
    expect(table.length).toBe(256 * 16)
    // spot check entry 0: x at [0..7], y at [8..15]
    const x0 = table.subarray(0, 8)
    const y0 = table.subarray(8, 16)
    expect(x0.length).toBe(8)
    expect(y0.length).toBe(8)
  })

  test('null input → null', () => {
    expect(parseDoublingsTable(null)).toBeNull()
  })

  test('wrong length hex → null', () => {
    expect(parseDoublingsTable('aabb')).toBeNull()
    expect(parseDoublingsTable('a'.repeat(16383))).toBeNull()
    expect(parseDoublingsTable('a'.repeat(16385))).toBeNull()
  })

  test('empty string → null', () => {
    expect(parseDoublingsTable('')).toBeNull()
  })

  test('first entry x-coord bytes are preserved exactly', () => {
    const x0 = new Uint8Array(32)
    for (let i = 0; i < 32; i++) x0[i] = i
    const entries = DUMMY_ENTRIES.map((e, i) => i === 0 ? { x: x0, y: e.y } : e)
    const table = parseDoublingsTable(makeTableBinary(entries))
    // Reconstruct bytes from flat table entry 0 x-words (LSW-first)
    const recovered = new Uint8Array(32)
    for (let i = 0; i < 8; i++) {
      const idx = 28 - i * 4
      recovered[idx]   = (table[i] >>> 24) & 0xff
      recovered[idx+1] = (table[i] >>> 16) & 0xff
      recovered[idx+2] = (table[i] >>>  8) & 0xff
      recovered[idx+3] =  table[i]          & 0xff
    }
    expect(Array.from(recovered)).toEqual(Array.from(x0))
  })

  test('last entry (index 255) is parsed correctly', () => {
    const table = parseDoublingsTable(makeTableBinary(DUMMY_ENTRIES))
    // entry 255: x = fill(255 & 0xff = 0xff), so x-words are non-zero
    expect(table[255 * 16]).not.toBe(0)
  })

  // Vehicle public key verification tests
  // bytes [0..31] of binary table = entry[0].x raw bytes = vehiclePublicKey[1..32]
  // bytes [32..63] of binary table = entry[0].y raw bytes = vehiclePublicKey[33..64]

  function makeVehicleKey(x0bytes, y0bytes) {
    const key = new Uint8Array(65)
    key[0] = 0x04
    key.set(x0bytes, 1)
    key.set(y0bytes, 33)
    return key
  }

  function makeTableWithFirstEntry(x0, y0) {
    const entries = DUMMY_ENTRIES.map((e, i) => i === 0 ? { x: x0, y: y0 } : e)
    return makeTableBinary(entries)
  }

  test('vehiclePublicKey null — skips key check, returns table', () => {
    const data = makeTableBinary(DUMMY_ENTRIES)
    const table = parseDoublingsTable(data, null)
    expect(table).not.toBeNull()
    expect(table.length).toBe(256 * 16)
  })

  test('vehiclePublicKey matches first entry — returns table', () => {
    const x0 = new Uint8Array(32).fill(0xab)
    const y0 = new Uint8Array(32).fill(0xcd)
    const data = makeTableWithFirstEntry(x0, y0)
    const vehicleKey = makeVehicleKey(x0, y0)
    const table = parseDoublingsTable(data, vehicleKey)
    expect(table).not.toBeNull()
    expect(table.length).toBe(256 * 16)
  })

  test('vehiclePublicKey x-mismatch — returns null', () => {
    const x0 = new Uint8Array(32).fill(0xab)
    const y0 = new Uint8Array(32).fill(0xcd)
    const data = makeTableWithFirstEntry(x0, y0)
    const wrongX = new Uint8Array(32).fill(0x99)
    expect(parseDoublingsTable(data, makeVehicleKey(wrongX, y0))).toBeNull()
  })

  test('vehiclePublicKey y-mismatch — returns null', () => {
    const x0 = new Uint8Array(32).fill(0xab)
    const y0 = new Uint8Array(32).fill(0xcd)
    const data = makeTableWithFirstEntry(x0, y0)
    const wrongY = new Uint8Array(32).fill(0x99)
    expect(parseDoublingsTable(data, makeVehicleKey(x0, wrongY))).toBeNull()
  })

  test('vehiclePublicKey single-byte x-mismatch at last byte — returns null', () => {
    const x0 = new Uint8Array(32).fill(0x11)
    const y0 = new Uint8Array(32).fill(0x22)
    const data = makeTableWithFirstEntry(x0, y0)
    const wrongX = new Uint8Array(32).fill(0x11)
    wrongX[31] = 0xff
    expect(parseDoublingsTable(data, makeVehicleKey(wrongX, y0))).toBeNull()
  })

  test('vehiclePublicKey wrong length — skips key check, returns table', () => {
    const data = makeTableBinary(DUMMY_ENTRIES)
    const shortKey = new Uint8Array(33)
    expect(parseDoublingsTable(data, shortKey)).not.toBeNull()
  })
})

// ── TeslaSession._hmac (pre-computed HMAC pads) ────────────────────────────
// _hmac uses pads pre-computed from sessionKey to avoid allocating innerPad/outerPad
// on every command. Must match hmacSha256(sessionKey, message) exactly.

describe('TeslaSession HMAC lifecycle', () => {
  const KEY = '0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'

  test('_cmdHmacFn null before session established', () => {
    const s = new TeslaSession()
    expect(s._cmdHmacFn).toBeNull()
  })

  test('_cmdHmacFn null after reset()', () => {
    const s = new TeslaSession()
    s.sessionKey = hexToBytes(KEY)
    initSessionHmacs(s)
    expect(s._cmdHmacFn).not.toBeNull()
    s.reset()
    expect(s._cmdHmacFn).toBeNull()
  })

  test('_cmdHmacFn restored and correct after re-establish', () => {
    const s = new TeslaSession()
    s.sessionKey = hexToBytes(KEY)
    initSessionHmacs(s)
    s.reset()
    s.sessionKey = hexToBytes(KEY)
    initSessionHmacs(s)
    expect(s._cmdHmacFn).not.toBeNull()
    const msg = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    const { cmdHmac } = createSessionHmacs(hexToBytes(KEY))
    expect(s._cmdHmacFn(msg)).toEqual(cmdHmac(msg))
  })
})


// ── getVehicleStatus message structure ────────────────────────────────────
// Bug fix: was passing `informationRequest` key to buildRoutableMessage which
// doesn't recognise it — silently dropped, sending an empty routable message.
// Born in Copilot commit 6f0ea70. Also removed unused `const self = this`.

describe('getVehicleStatus — sends UNSIGNED GET_STATUS request (SDK AuthMethodNone)', () => {
  let capturedMsg

  function makeSession() {
    const s = new TeslaSession()
    s.established  = true
    s.sessionKey   = new Uint8Array(16).fill(0x0b)
    s.epoch        = new Uint8Array(16).fill(0xee)
    s.counter      = 5
    s.clockTime    = 1000
    s.routingAddress = new Uint8Array(16).fill(0x01)
    s.ephemeralPublicKey = new Uint8Array(65).fill(0x04)
    initSessionHmacs(s)
    return s
  }

  beforeEach(() => {
    capturedMsg = undefined
    teslaBLE.connected = true
    // getVehicleStatus is addressed like the SDK dispatcher: an unsigned read with a
    // per-request routing address (from_destination) + uuid, sent via sendAddressed; the
    // waiter matches the reply the car addresses back to that routing address.
    teslaBLE.sendAddressed = (msg, _match, _cb) => { capturedMsg = msg; return { token: true } }
  })

  afterEach(() => {
    teslaBLE.connected = false
    delete teslaBLE.sendAddressed
  })

  test('sends a non-empty message (was empty before fix)', () => {
    makeSession().getVehicleStatus(() => {})
    expect(capturedMsg).toBeDefined()
    expect(capturedMsg.length).toBeGreaterThan(0)
  })

  test('returns error immediately if session not established', () => {
    let result
    new TeslaSession().getVehicleStatus(r => { result = r })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not established/i)
    expect(capturedMsg).toBeUndefined()
  })

  test('increments the session counter (signed read)', () => {
    const s = makeSession()
    s.getVehicleStatus(() => {})
    expect(s.counter).toBe(6) // signed (like a command) — consumes a counter so the car serves it
  })

  test('RoutableMessage has DOMAIN_VEHICLE_SECURITY at field 6', () => {
    makeSession().getVehicleStatus(() => {})
    const outer = decodeMessage(capturedMsg)
    expect(outer[6]).toBeDefined()
    expect(decodeMessage(outer[6])[1]).toBe(DOMAIN_VEHICLE_SECURITY)
  })

  test('has payload at field 10 — not empty', () => {
    makeSession().getVehicleStatus(() => {})
    const outer = decodeMessage(capturedMsg)
    expect(outer[10]).toBeDefined()
    expect(outer[10].length).toBeGreaterThan(0)
  })

  // GET_STATUS is a READ — sent UNSIGNED (no signature_data), matching the official SDK
  // (pkg/vehicle/vcsec.go getVCSECInfo → connector.AuthMethodNone). A SIGNED status
  // request rides on the session counter/clock and a dozing car silently drops it
  // (device 2026-06-15: signed GET_STATUS ignored ~20s → stale lock state → toggle misfired).
  test('HAS signature_data (field 13) — signed so the car serves a passive-entry key', () => {
    makeSession().getVehicleStatus(() => {})
    expect(decodeMessage(capturedMsg)[13]).toBeDefined()
  })

  test('payload(10) is a bare UnsignedMessage carrying informationRequest (field 1)', () => {
    makeSession().getVehicleStatus(() => {})
    const unsignedMsg = decodeMessage(decodeMessage(capturedMsg)[10])
    expect(unsignedMsg[1]).toBeDefined()   // informationRequest present
    expect(unsignedMsg[2]).toBeUndefined() // not an RKEAction
  })

  test('UnsignedMessage has InformationRequest with GET_STATUS (0)', () => {
    makeSession().getVehicleStatus(() => {})
    const unsignedMsg = decodeMessage(decodeMessage(capturedMsg)[10])
    const infoReq     = decodeMessage(unsignedMsg[1])
    expect(infoReq[1]).toBe(0)  // GET_STATUS = 0
  })

  test('addressed like the SDK dispatcher: has from_destination (field 7) and a 16-byte uuid (field 51)', () => {
    // The SDK's dispatcher generates a random per-request routing address for a VCSEC
    // request, sets it as from_destination, and a uuid (internal/dispatcher Send). The car
    // echoes the address back so the reply self-routes to this fetch's waiter.
    makeSession().getVehicleStatus(() => {})
    const outer = decodeMessage(capturedMsg)
    expect(outer[7]).toBeDefined()        // from_destination (routing address) present
    expect(outer[51].length).toBe(16)     // 16-byte uuid present
  })

  test('resolves on an ADDRESSED VehicleStatus reply (car echoes our routing address)', () => {
    // The car echoes our from_destination (field 7 → routing_address field 2) as the
    // reply's to_destination, and the fetch's waiter matches on that address.
    const statusBytes = new Uint8Array([0x10, 0x01]) // VehicleStatus{ vehicleLockState=1 }
    const fromVcsec = encodeBytes(1, statusBytes)    // FromVCSECMessage.vehicleStatus=1
    let result
    const s = makeSession()
    teslaBLE.sendAddressed = (msg, match, cb) => {
      const fromDest = decodeMessage(msg)[7]
      const statusAddr = fromDest ? decodeMessage(fromDest)[2] : null
      const frame = concat(encodeBytes(6, encodeBytes(2, statusAddr)), encodeBytes(10, fromVcsec))
      if (match(frame)) cb({ success: true, data: frame })
      return { token: true }
    }
    s.getVehicleStatus((r) => { result = r })
    expect(result.success).toBe(true)
    expect(result.status.vehicleLockState).toBe(1)
  })
})

// ── buildAuthenticatedCommand — correct HMAC structure ────────────────────
// HMAC auth data in RoutableMessage.signature_data (field 13), not in vcsec.proto SignedMessage.

describe('buildAuthenticatedCommand — SignatureData structure', () => {
  function makeSession() {
    const s = new TeslaSession()
    s.established  = true
    s.sessionKey   = new Uint8Array(16).fill(0x0b)
    s.epoch        = new Uint8Array(16).fill(0xee)
    s.counter      = 10
    s.clockTime    = 2000
    s.routingAddress = new Uint8Array(16).fill(0x02)
    s.ephemeralPublicKey = new Uint8Array(65).fill(0x04)
    initSessionHmacs(s)
    return s
  }

  test('increments counter by 1', () => {
    const s = makeSession()
    s.buildAuthenticatedCommand(RKE_ACTION_LOCK)
    expect(s.counter).toBe(11)
  })

  test('RoutableMessage has DOMAIN_VEHICLE_SECURITY at field 6', () => {
    const msg = makeSession().buildAuthenticatedCommand(RKE_ACTION_UNLOCK)
    expect(decodeMessage(decodeMessage(msg)[6])[1]).toBe(DOMAIN_VEHICLE_SECURITY)
  })

  test('SignatureData at field 13; payload(10) is a bare UnsignedMessage (no wrapper)', () => {
    const msg = makeSession().buildAuthenticatedCommand(RKE_ACTION_LOCK)
    const outer = decodeMessage(msg)
    expect(outer[13]).toBeDefined()
    expect(outer[10]).toBeDefined()
    // Payload is the vcsec.UnsignedMessage directly: RKEAction at field 2, and no
    // ToVCSECMessage/SignedMessage wrapper (field 1 would be InformationRequest).
    const unsigned = decodeMessage(outer[10])
    expect(unsigned[2]).toBe(RKE_ACTION_LOCK)
    expect(unsigned[1]).toBeUndefined()
  })

  test('SignatureData signer_identity contains 65-byte public key', () => {
    const msg = makeSession().buildAuthenticatedCommand(RKE_ACTION_LOCK)
    const sigData = decodeMessage(decodeMessage(msg)[13])
    const keyId = decodeMessage(sigData[1])
    expect(keyId[1].length).toBe(65)
  })

  test('HMAC_Personalized_data has counter=11, epoch(16B), expires_at=2060, tag(32B)', () => {
    const msg = makeSession().buildAuthenticatedCommand(RKE_ACTION_LOCK)
    const sigData  = decodeMessage(decodeMessage(msg)[13])
    const hmacData = decodeMessage(sigData[8])
    expect(hmacData[2]).toBe(11)           // counter (varint field 2)
    expect(hmacData[1].length).toBe(16)   // epoch
    expect(hmacData[3].length).toBe(4)    // expires_at as fixed32 LE
    expect(hmacData[4].length).toBe(32)   // HMAC-SHA256 tag
    // expires_at = 2060 = 0x80C → LE [0x0C, 0x08, 0x00, 0x00]
    expect(hmacData[3][0]).toBe(0x0C)
    expect(hmacData[3][1]).toBe(0x08)
  })

  test('UnsignedMessage has LOCK=1 at field 2', () => {
    const msg = makeSession().buildAuthenticatedCommand(RKE_ACTION_LOCK)
    const unsigned = decodeMessage(decodeMessage(msg)[10])
    expect(unsigned[2]).toBe(RKE_ACTION_LOCK)
  })

  test('UnsignedMessage has UNLOCK=0 at field 2', () => {
    const msg = makeSession().buildAuthenticatedCommand(RKE_ACTION_UNLOCK)
    const unsigned = decodeMessage(decodeMessage(msg)[10])
    expect(unsigned[2]).toBe(RKE_ACTION_UNLOCK)
  })

  test('different commands produce different HMAC tags', () => {
    const s = makeSession()
    const m1 = s.buildAuthenticatedCommand(RKE_ACTION_LOCK)
    const m2 = s.buildAuthenticatedCommand(RKE_ACTION_UNLOCK)
    const tag1 = decodeMessage(decodeMessage(decodeMessage(m1)[13])[8])[4]
    const tag2 = decodeMessage(decodeMessage(decodeMessage(m2)[13])[8])[4]
    expect(Array.from(tag1)).not.toEqual(Array.from(tag2))
  })

  test('expiresAt advances with real elapsed time since clock capture (no TIME_EXPIRED)', () => {
    // Vehicle validates expiresAt against its own ticking clock. ~30s into a connection
    // the window must be ~30s further out, not frozen at clockTime+60. (Signed commands
    // only — GET_STATUS is now unsigned and carries no expires_at.)
    const s = makeSession()
    s._clockCapturedAtMs = Date.now() - 30000 // captured 30s ago
    const msg = s.buildAuthenticatedCommand(RKE_ACTION_LOCK)
    const hmacData = decodeMessage(decodeMessage(decodeMessage(msg)[13])[8])
    const le = hmacData[3] // expires_at fixed32 LE
    const expiresAt = (le[0] | (le[1] << 8) | (le[2] << 16) | (le[3] << 24)) >>> 0
    // clockTime(2000) + ~30s elapsed + 60s window ≈ 2090 (allow a little timing slack).
    expect(expiresAt).toBeGreaterThanOrEqual(2088)
    expect(expiresAt).toBeLessThanOrEqual(2092)
  })

  test('throws if session not established', () => {
    const s = new TeslaSession()
    expect(() => s.buildAuthenticatedCommand(RKE_ACTION_LOCK)).toThrow(/not established/i)
  })
})

// ── _buildHMACTag — session wiring ───────────────────────────────────────
// Input construction is tested in vcsec.test.js (buildHMACTagInput).
// Here we verify session-specific concerns: HMAC application and store.vehicleVin wiring.

describe('TeslaSession._buildHMACTag — session wiring', () => {
  function makeSession() {
    store.vehicleVin = null
    const s = new TeslaSession()
    s.sessionKey = new Uint8Array(16).fill(0x0b)
    initSessionHmacs(s)
    return s
  }

  test('returns 32-byte HMAC tag', () => {
    const tag = makeSession()._buildHMACTag(new Uint8Array(16).fill(0xee), 1, 100, new Uint8Array([0x01]))
    expect(tag.length).toBe(32)
  })

  test('throws when _cmdHmacFn not initialized', () => {
    const s = new TeslaSession()
    expect(() => s._buildHMACTag(new Uint8Array(16), 1, 100, new Uint8Array([0x01]))).toThrow('Command HMAC not initialized')
  })

  test('different session keys produce different tags', () => {
    const s1 = makeSession()
    const s2 = new TeslaSession()
    s2.sessionKey = new Uint8Array(16).fill(0xcc)
    initSessionHmacs(s2)
    const epoch = new Uint8Array(16).fill(0xee)
    const payload = new Uint8Array([0xaa])
    expect(Array.from(s1._buildHMACTag(epoch, 1, 100, payload))).not.toEqual(Array.from(s2._buildHMACTag(epoch, 1, 100, payload)))
  })

  test('uses store.vehicleVin — different VINs produce different tags', () => {
    const s = makeSession()
    const epoch = new Uint8Array(16).fill(0xee)
    const payload = new Uint8Array([0x01])
    store.vehicleVin = 'ABC'
    const t1 = s._buildHMACTag(epoch, 1, 100, payload)
    store.vehicleVin = 'XYZ'
    const t2 = s._buildHMACTag(epoch, 1, 100, payload)
    expect(Array.from(t1)).not.toEqual(Array.from(t2))
  })
})

describe('passive entry — _handleAuthenticationRequest responder', () => {
  let sent

  function makeSession() {
    store.vehicleVin = null
    const s = new TeslaSession()
    s.established  = true
    s.sessionKey   = new Uint8Array(16).fill(0x0b)
    s.epoch        = new Uint8Array(16).fill(0xee)
    s.counter      = 5
    s.clockTime    = 1000
    s.routingAddress = new Uint8Array(16).fill(0x01)
    s.ephemeralPublicKey = new Uint8Array(65).fill(0x04)
    initSessionHmacs(s)
    return s
  }

  // RoutableMessage{ f10 = FromVCSECMessage{ f3 = AuthenticationRequest } }.
  // tokenByte distinguishes tokens for the dedupe tests; reason defaults to 1 (IDENTIFICATION).
  function authFrame(tokenByte = 0xab, reason = 1) {
    const token = new Uint8Array(20).fill(tokenByte)
    const reqToken = encodeBytes(1, token)              // AuthenticationRequestToken{ token=1 }
    const authReq = new Uint8Array([
      ...encodeBytes(2, reqToken),                       // sessionInfo=2
      0x18, 0x02,                                        // requestedLevel(3)=2
      0x22, 0x01, reason,                                // reasonsForAuth(4) packed=[reason]
    ])
    const fromVcsec = encodeBytes(3, authReq)            // FromVCSECMessage.authenticationRequest=3
    return encodeBytes(10, fromVcsec)                    // RoutableMessage.protobuf_message_as_bytes=10
  }

  beforeEach(() => {
    sent = []
    teslaBLE.connected = true
    teslaBLE.send = (msg) => { sent.push(msg) }
  })
  afterEach(() => {
    teslaBLE.connected = false
    delete teslaBLE.send
    teslaBLE.idleCallback = null
  })

  test('IDENTIFICATION beacon (reason 1) → signed AuthenticationResponse sent (presence)', () => {
    const s = makeSession()
    s.startStatusPushListener(() => {})
    teslaBLE.idleCallback({ success: true, data: authFrame(0xab, 1) })
    expect(sent.length).toBe(1)
    // Payload (field 10) is a bare UnsignedMessage carrying authenticationResponse (field 3),
    // and the message is session-signed (SignatureData at field 13).
    const outer = decodeMessage(sent[0])
    expect(outer[13]).toBeDefined()
    const unsigned = decodeMessage(outer[10])
    expect(unsigned[3]).toBeDefined()
    expect(decodeMessage(unsigned[3])[1]).toBe(2) // echoed requestedLevel=2
    expect(s.counter).toBe(6)                      // counter advanced (signed once)
  })

  test('dedupe by token: same token repeated → only one response', () => {
    const s = makeSession()
    s.startStatusPushListener(() => {})
    teslaBLE.idleCallback({ success: true, data: authFrame(0xab) })
    teslaBLE.idleCallback({ success: true, data: authFrame(0xab) })
    teslaBLE.idleCallback({ success: true, data: authFrame(0xab) })
    expect(sent.length).toBe(1)
  })

  test('fresh token → new response', () => {
    const s = makeSession()
    s.startStatusPushListener(() => {})
    teslaBLE.idleCallback({ success: true, data: authFrame(0xab) })
    teslaBLE.idleCallback({ success: true, data: authFrame(0xcd) }) // token rotated
    expect(sent.length).toBe(2)
  })

  test('no response when session not established', () => {
    const s = makeSession()
    s.established = false
    s.startStatusPushListener(() => {})
    teslaBLE.idleCallback({ success: true, data: authFrame() })
    expect(sent.length).toBe(0)
  })

  // RoutableMessage{ f10 = FromVCSECMessage{ f44 = AppDeviceInfoRequest (varint) } }
  function deviceInfoFrame(value = 1) {
    const fromVcsec = new Uint8Array([0xe0, 0x02, value]) // field 44 varint = value
    return encodeBytes(10, fromVcsec)
  }

  test('AppDeviceInfoRequest → signed AppDeviceInfo (UnsignedMessage field 40) sent', () => {
    const s = makeSession()
    s.startStatusPushListener(() => {})
    teslaBLE.idleCallback({ success: true, data: deviceInfoFrame(1) })
    expect(sent.length).toBe(1)
    const outer = decodeMessage(sent[0])
    expect(outer[13]).toBeDefined()                 // session-signed
    const unsigned = decodeMessage(outer[10])
    expect(unsigned[40]).toBeDefined()              // appDeviceInfo at field 40
    const info = decodeMessage(unsigned[40])
    expect(info[1]).toBeInstanceOf(Uint8Array)      // hardware_model_sha256
    expect(info[1].length).toBe(32)
    expect(info[2]).toBe(1)                          // os = ANDROID
  })

  test('AppDeviceInfoRequest debounced within 1s → only one response', () => {
    const s = makeSession()
    s.startStatusPushListener(() => {})
    teslaBLE.idleCallback({ success: true, data: deviceInfoFrame(1) })
    teslaBLE.idleCallback({ success: true, data: deviceInfoFrame(1) })
    expect(sent.length).toBe(1)
  })

  test('does NOT respond while a command is in flight (no slot-stealing)', () => {
    const s = makeSession()
    s.startStatusPushListener(() => {})
    s._commandInFlight = true
    teslaBLE.idleCallback({ success: true, data: authFrame(0xab) })
    expect(sent.length).toBe(0)
    // token NOT marked answered: once the command finishes, the next beacon is answered
    s._commandInFlight = false
    teslaBLE.idleCallback({ success: true, data: authFrame(0xab) })
    expect(sent.length).toBe(1)
  })
})

// Device captures 2026-06-11: while getVehicleStatus owned the BLE response slot
// (15s deadline), the streaming IDENTIFICATION beacons were requeued unanswered —
// the idle listener never saw them — and the car DROPPED THE LINK after ~8s,
// before any status arrived. App-load state never loaded. getVehicleStatus must
// dispatch passive-entry requests itself while it waits.
describe('getVehicleStatus — passive-entry dispatch while waiting', () => {
  let sent, pendingCb

  function makeSession() {
    store.vehicleVin = null
    const s = new TeslaSession()
    s.established  = true
    s.sessionKey   = new Uint8Array(16).fill(0x0b)
    s.epoch        = new Uint8Array(16).fill(0xee)
    s.counter      = 5
    s.clockTime    = 1000
    s.routingAddress = new Uint8Array(16).fill(0x01)
    s.ephemeralPublicKey = new Uint8Array(65).fill(0x04)
    initSessionHmacs(s)
    return s
  }

  function authFrame(tokenByte = 0xab, reason = 1) {
    const token = new Uint8Array(20).fill(tokenByte)
    const reqToken = encodeBytes(1, token)
    const authReq = new Uint8Array([
      ...encodeBytes(2, reqToken),
      0x18, 0x02,
      0x22, 0x01, reason,
    ])
    return encodeBytes(10, encodeBytes(3, authReq))
  }

  beforeEach(() => {
    sent = []
    pendingCb = null
    teslaBLE.connected = true
    // GET_STATUS now goes via the address-routed waiter (sendAddressed); the responder's
    // signed AuthenticationResponse still goes via send. Capture both into `sent`.
    teslaBLE.sendAddressed = (msg, _match, _cb) => { sent.push(msg); return { token: true } }
    teslaBLE.send = (msg, cb) => { sent.push(msg); pendingCb = cb; return cb }
  })
  afterEach(() => {
    teslaBLE.connected = false
    delete teslaBLE.send
    delete teslaBLE.sendAddressed
    teslaBLE.idleCallback = null
    teslaBLE.responseCallback = null
  })

  test('auth beacon during the status wait → answered by the idle listener, fetch not settled', () => {
    jest.useFakeTimers()
    try {
      const s = makeSession()
      s.startStatusPushListener(() => {}) // arms idleCallback — beacons go here now
      const results = []
      s.getVehicleStatus((r) => results.push(r))
      expect(sent.length).toBe(1) // GET_STATUS out (via sendAddressed)

      // A beacon is addressed elsewhere, so it never matches the fetch's address-routed
      // waiter — it falls through to the idle listener, which ANSWERS it. The fetch is
      // untouched (it no longer owns the slot, so beacons can't starve the link either).
      teslaBLE.idleCallback({ success: true, data: authFrame(0xcd, 1) })
      expect(sent.length).toBe(2)
      const unsigned = decodeMessage(decodeMessage(sent[1])[10])
      expect(unsigned[3]).toBeDefined() // authenticationResponse
      expect(results.length).toBe(0)    // beacon did not settle the fetch

      // The fetch stays bounded by its own deadline (statusTimeoutMs — the
      // push-paced status wait is longer than the command deadline).
      jest.advanceTimersByTime(s.statusTimeoutMs + 1)
      expect(results.length).toBe(1)
      expect(results[0].success).toBe(false)
    } finally {
      jest.useRealTimers()
    }
  })

  test('does not hold the responder gate (no _commandInFlight during a status fetch)', () => {
    jest.useFakeTimers() // the fetch arms a real deadline timer; keep it off the real clock
    try {
      const s = makeSession()
      s.getVehicleStatus(() => {})
      expect(s._commandInFlight).not.toBe(true)
      s.reset()
    } finally {
      jest.clearAllTimers()
      jest.useRealTimers()
    }
  })

  // No beacon suppression: device 2026-06-26 proved the car never serves an addressed
  // read to a passive-entry key, and pausing our replies only DELAYED the VehicleStatus
  // push (the real status channel, which advances as we answer beacons). So a beacon
  // during a status fetch is answered immediately — no quiet window.
  test('a beacon during a status fetch is answered immediately (no suppression)', () => {
    jest.useFakeTimers()
    try {
      const s = makeSession()
      s.startStatusPushListener(() => {}) // arms idleCallback
      s.getVehicleStatus(() => {})
      const before = sent.length
      teslaBLE.idleCallback({ success: true, data: authFrame(0xcd, 1) }) // AuthenticationRequest
      expect(sent.length).toBe(before + 1) // AuthenticationResponse sent right away
    } finally {
      jest.clearAllTimers()
      jest.useRealTimers()
    }
  })

  test('honors a custom deadline (short app-load fetch)', () => {
    jest.useFakeTimers()
    try {
      const s = makeSession()
      const results = []
      s.getVehicleStatus((r) => results.push(r), 4000)
      jest.advanceTimersByTime(3999)
      expect(results.length).toBe(0)
      jest.advanceTimersByTime(2)
      expect(results.length).toBe(1)
      expect(results[0].success).toBe(false)
    } finally {
      jest.useRealTimers()
    }
  })

  test('idle responder defers to a REAL command in flight (gate respected)', () => {
    jest.useFakeTimers()
    try {
      const s = makeSession()
      s.startStatusPushListener(() => {})
      s.getVehicleStatus(() => {})
      expect(sent.length).toBe(1) // GET_STATUS out
      s._commandInFlight = true // e.g. a command racing the fetch owns the response slot
      // Beacon to the idle listener while a command is in flight — the responder must
      // NOT seize the slot (it would steal the command's reply).
      teslaBLE.idleCallback({ success: true, data: authFrame(0xcd, 1) })
      expect(sent.length).toBe(1) // no responder send — command owns the slot
      jest.advanceTimersByTime(s.commandTimeoutMs + 1)
      s._commandInFlight = false
      s.reset()
    } finally {
      jest.useRealTimers()
    }
  })
})

// ── no pre-command wake prod ─────────────────────────────────────────────────
// A command sends exactly ONE frame (the signed RKE action) — no wake prod ahead of
// it. VCSEC actuates RKE while dozing, so a wake was never needed to land the command;
// it existed only as first-frame insurance and fed the car's RKE rate limit. The Go SDK
// sends no wake before Lock/Unlock either — retriesOnTimeout is the whole safety net.
describe('sendCommand — no wake prod, command sent alone', () => {
  let wakes, addressed
  let origSNR, origSA, origConnected

  function makeSession() {
    store.vehicleVin = null
    const s = new TeslaSession()
    s.established = true
    s.sessionKey = new Uint8Array(16).fill(0x0b)
    s.epoch = new Uint8Array(16).fill(0xee)
    s.counter = 5
    s.clockTime = 1000
    s.routingAddress = new Uint8Array(16).fill(0x01)
    s.ephemeralPublicKey = new Uint8Array(65).fill(0x04)
    initSessionHmacs(s)
    return s
  }

  beforeEach(() => {
    jest.useFakeTimers()
    wakes = []
    addressed = []
    origSNR = teslaBLE.sendNoReply
    origSA = teslaBLE.sendAddressed
    origConnected = teslaBLE.connected
    teslaBLE.connected = true
    teslaBLE.sendNoReply = (msg) => { wakes.push(msg); return true }
    teslaBLE.sendAddressed = (msg, match, cb) => { addressed.push({ msg, match, cb }); return 'tok' + addressed.length }
  })
  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
    teslaBLE.sendNoReply = origSNR
    teslaBLE.sendAddressed = origSA
    teslaBLE.connected = origConnected
  })

  test('cold session → NO wake prod, only the command goes out', () => {
    const s = makeSession()
    s.sendCommand(RKE_ACTION_LOCK, () => {})
    expect(wakes.length).toBe(0) // no prod
    expect(addressed.length).toBe(1) // just the command
  })

  test('repeated taps never emit a prod (no RKE-rate-limit feed)', () => {
    const s = makeSession()
    s.sendCommand(RKE_ACTION_LOCK, () => {})
    const fromVcsec = encodeBytes(3, new Uint8Array([0x18, 0x02]))
    addressed[0].cb({ success: true, data: encodeBytes(10, fromVcsec) })
    s.sendCommand(RKE_ACTION_LOCK, () => {})
    expect(wakes.length).toBe(0)
    expect(addressed.length).toBe(2)
  })
})

// ── anti-replay counter seeding (Tesla SDK parity) ──────────────────────────
// The vehicle silently drops a signed message whose counter isn't strictly above the
// last it accepted for the current epoch. On a fast reconnect the car's SessionInfo
// counter can LAG what we already pushed, so seeding from it blindly replays counters
// it already saw. Mirroring the SDK's UpdateSessionInfo, we seed with
// max(persisted-high-water-for-this-epoch, sessionInfo.counter) — never lower.
describe('_processSessionInfo — anti-replay counter seeding', () => {
  const EPOCH_EE = 'ee'.repeat(16) // hex of 16 bytes of 0xee (the response epoch below)

  function makeResponse(counter, epochByte = 0xee) {
    return {
      sessionInfo: {
        publicKey: new Uint8Array(65).fill(0x04),
        epoch: new Uint8Array(16).fill(epochByte),
        counter,
        clockTime: 1000,
      },
      sessionInfoTag: new Uint8Array(16).fill(0x01),
    }
  }
  // In-memory counterStore injected into the session (the session is storage-agnostic;
  // on device the facade injects store.counterStore). `mem` stands in for persistence.
  let mem
  function makeSession() {
    store.reset()
    store.vehicleVin = null
    mem = null
    const s = new TeslaSession()
    s.ephemeralPublicKey = new Uint8Array(65).fill(0x04)
    store.sessionKey = new Uint8Array(16).fill(0x0b)       // cached-key fast path
    store.vehicleEcPublicKey = new Uint8Array(65).fill(0x04) // matches response pubkey
    s._verifySessionInfoTag = () => true                    // skip real HMAC verify
    s.counterStore = {
      load: (ep) => (mem && mem.epoch === ep ? mem.counter : null),
      save: (ep, counter) => { mem = { epoch: ep, counter } },
    }
    return s
  }

  test('same epoch + persisted high-water ABOVE SessionInfo → counter RAISED (no replay)', () => {
    const s = makeSession()
    mem = { epoch: EPOCH_EE, counter: 130 }
    s._processSessionInfo(makeResponse(119), () => {})
    expect(s.counter).toBe(130) // not the stale 119 the car reported
  })

  test('same epoch + persisted BELOW SessionInfo → SessionInfo wins (never lowered)', () => {
    const s = makeSession()
    mem = { epoch: EPOCH_EE, counter: 100 }
    s._processSessionInfo(makeResponse(140), () => {})
    expect(s.counter).toBe(140)
  })

  test('DIFFERENT epoch → persisted high-water ignored (car reset its counter space)', () => {
    const s = makeSession()
    mem = { epoch: 'aa'.repeat(16), counter: 999 }
    s._processSessionInfo(makeResponse(5), () => {})
    expect(s.counter).toBe(5)
  })

  test('no persisted state → SessionInfo value used as-is', () => {
    const s = makeSession()
    s._processSessionInfo(makeResponse(50), () => {})
    expect(s.counter).toBe(50)
  })

  test('establish records the seed as the persisted high-water floor', () => {
    const s = makeSession()
    s._processSessionInfo(makeResponse(60), () => {})
    expect(mem).toEqual({ epoch: EPOCH_EE, counter: 60 })
  })

  test('no counterStore wired → session simply does not persist (storage-agnostic)', () => {
    const s = makeSession()
    s.counterStore = null
    expect(() => s._processSessionInfo(makeResponse(70), () => {})).not.toThrow()
    expect(s.counter).toBe(70)
  })
})
