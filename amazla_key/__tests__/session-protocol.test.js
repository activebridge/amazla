// Session protocol tests: vcsec session builders, key pool binary format, generateKeyPool

import {
  SIGNATURE_TYPE_HMAC,
  RKE_ACTION_LOCK,
  RKE_ACTION_UNLOCK,
  RKE_ACTION_OPEN_TRUNK,
  RKE_ACTION_OPEN_FRUNK,
  buildRoutableMessage,
  buildSessionInfoRequest,
  buildSignedMessage,
  buildToVCSECMessage,
  buildUnsignedMessage,
  parseSessionInfo,
  parseRoutableMessage,
  generateUUID,
  generateRoutingAddress,
  DOMAIN_VEHICLE_SECURITY,
} from '../lib/tesla-ble/protocol/vcsec.js'
import { decodeMessage, encodeBytes, encodeEnum, encodeVarintField } from '../lib/tesla-ble/protocol/protobuf.js'
import bleCryptoSession from '../app-side/ble-crypto.js'
import { TeslaSession } from '../lib/tesla-ble/session.js'
import { hmacSha256 } from '../lib/tesla-ble/crypto/hmac.js'

function bytesToHex(b) {
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
}

// ── vcsec session builders ──────────────────────────────────────────────────

describe('RKE action constants', () => {
  test('UNLOCK=0, LOCK=1, OPEN_TRUNK=2, OPEN_FRUNK=3 — DO NOT CHANGE', () => {
    expect(RKE_ACTION_UNLOCK).toBe(0)
    expect(RKE_ACTION_LOCK).toBe(1)
    expect(RKE_ACTION_OPEN_TRUNK).toBe(2)
    expect(RKE_ACTION_OPEN_FRUNK).toBe(3)
  })

  test('SIGNATURE_TYPE_HMAC=5', () => {
    expect(SIGNATURE_TYPE_HMAC).toBe(5)
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

describe('buildSignedMessage — session fields', () => {
  test('includes counter at field 4, epoch at field 6, expiresAt at field 7', () => {
    const payload = new Uint8Array([0x10, 0x01])
    const epoch   = new Uint8Array(16).fill(0xee)
    const msg = buildSignedMessage({
      payload,
      signatureType: SIGNATURE_TYPE_HMAC,
      counter: 42,
      epoch,
      expiresAt: 1000,
    })
    const fields = decodeMessage(msg)
    expect(fields[2]).toBeDefined()           // payload
    expect(fields[3]).toBe(SIGNATURE_TYPE_HMAC)
    expect(fields[4]).toBe(42)                // counter
    expect(fields[6].length).toBe(16)         // epoch bytes
    expect(fields[7]).toBe(1000)              // expiresAt
    expect(fields[5]).toBeUndefined()         // no signature yet
  })

  test('includes signature at field 5 when provided', () => {
    const sig = new Uint8Array(32).fill(0xaa)
    const msg = buildSignedMessage({
      payload: new Uint8Array([0x01]),
      signatureType: SIGNATURE_TYPE_HMAC,
      counter: 1,
      epoch: new Uint8Array(16),
      expiresAt: 100,
      signature: sig,
    })
    expect(decodeMessage(msg)[5].length).toBe(32)
  })
})

describe('buildSessionInfoRequest', () => {
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
  test('to_destination domain at field 6, routing_address at field 7, payload at 10, uuid at 50', () => {
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
    // field 50 = uuid
    expect(fields[50].length).toBe(16)
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
  test('extracts payload (field 10) and sessionInfo (field 3)', () => {
    const innerPayload = new Uint8Array([0x01, 0x02, 0x03])
    const sessionInfoBytes = makeSessionInfoBytes(5, 1234)

    const encoded = [
      encodeBytes(3, sessionInfoBytes),
      encodeBytes(10, innerPayload),
    ].reduce((a, b) => { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r }, new Uint8Array(0))

    const parsed = parseRoutableMessage(encoded)
    expect(Array.from(parsed.payload)).toEqual([0x01, 0x02, 0x03])
    expect(parsed.sessionInfo).not.toBeNull()
    expect(parsed.sessionInfo.counter).toBe(5)
    expect(parsed.sessionInfo.clockTime).toBe(1234)
  })

  test('extracts sessionInfo from field 6 (real vehicle response format)', () => {
    // The actual Tesla vehicle sends SessionInfo in field 6, not field 3.
    // This is the case fixed in _doSessionInfoRequest: the handler must not
    // give up when field 3 is absent — it must also check field 6.
    const sessionInfoBytes = makeSessionInfoBytes(99, 5678)
    const encoded = encodeBytes(6, sessionInfoBytes)

    const parsed = parseRoutableMessage(encoded)
    expect(parsed.sessionInfo).not.toBeNull()
    expect(parsed.sessionInfo.counter).toBe(99)
    expect(parsed.sessionInfo.clockTime).toBe(5678)
    expect(parsed.sessionInfo.publicKey.length).toBe(65)
    expect(parsed.sessionInfo.epoch.length).toBe(16)
  })

  test('returns null sessionInfo when field 3 absent', () => {
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

  test('real SessionInfo response (field 6) does NOT trigger intermediate ack condition', () => {
    const sessionInfoBytes = makeSessionInfoBytes(7, 9999)
    const encoded = encodeBytes(6, sessionInfoBytes)
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

// ── key pool hex format ────────────────────────────────────────────────────
// Key pool is now stored as binary string: N×97 bytes per key
// (32 bytes for private key + 65 bytes for public key).
// Binary format reduces storage by 50% vs hex, direct byte slicing on pop.

describe('Key pool binary format (97 bytes/key: 32 priv + 65 pub)', () => {
  function bytesToBinaryString(b) {
    let s = ''
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
    return s
  }
  
  function binaryStringToBytes(s) {
    const b = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff
    return b
  }

  function makePool(keys) {
    return keys.map(k => bytesToBinaryString(k.priv) + bytesToBinaryString(k.pub)).join('')
  }

  function poolSize(data) {
    if (!data) return 0
    return (data.length / 97) | 0
  }

  function popKey(data) {
    if (!data || data.length < 97) return null
    return {
      priv:      binaryStringToBytes(data.slice(0, 32)),
      pub:       binaryStringToBytes(data.slice(32, 97)),
      remaining: data.slice(97) || null,
    }
  }

  test('pool string length is keys.length × 97', () => {
    const keys = Array.from({ length: 5 }, (_, i) => ({
      priv: new Uint8Array(32).fill(i + 1),
      pub:  new Uint8Array(65).fill(i + 0x10),
    }))
    expect(makePool(keys).length).toBe(5 * 97)
  })

  test('poolSize is O(1) — derived from string length, no decode', () => {
    const keys = Array.from({ length: 7 }, (_, i) => ({
      priv: new Uint8Array(32).fill(i + 1),
      pub:  new Uint8Array(65).fill(i + 0x10),
    }))
    const data = makePool(keys)
    expect(poolSize(data)).toBe(7)
    expect(data.length / 97).toBeCloseTo(7, 5) // exact — no rounding
  })

  test('poolSize of empty string or null is 0', () => {
    expect(poolSize('')).toBe(0)
    expect(poolSize(null)).toBe(0)
  })

  test('pop returns first key (priv 32 bytes, pub 65 bytes)', () => {
    const priv0 = new Uint8Array(32).fill(0xaa)
    const pub0  = new Uint8Array(65).fill(0xbb)
    const keys  = [{ priv: priv0, pub: pub0 }, { priv: new Uint8Array(32).fill(0xcc), pub: new Uint8Array(65).fill(0xdd) }]
    const result = popKey(makePool(keys))
    expect(result).not.toBeNull()
    expect(result.priv.length).toBe(32)
    expect(result.pub.length).toBe(65)
    expect(result.priv[0]).toBe(0xaa)
    expect(result.pub[0]).toBe(0xbb)
  })

  test('pop reduces pool size by 1', () => {
    const keys = Array.from({ length: 3 }, (_, i) => ({
      priv: new Uint8Array(32).fill(i + 1),
      pub:  new Uint8Array(65).fill(i + 0x10),
    }))
    const hex    = makePool(keys)
    const result = popKey(hex)
    expect(poolSize(result.remaining)).toBe(2)
  })

  test('pop from single-key pool leaves null remaining', () => {
    const key = { priv: new Uint8Array(32).fill(0x01), pub: new Uint8Array(65).fill(0x04) }
    const result = popKey(makePool([key]))
    expect(result.remaining).toBeNull()
    expect(poolSize(result.remaining)).toBe(0)
  })

  test('pop from empty pool returns null', () => {
    expect(popKey('')).toBeNull()
    expect(popKey(null)).toBeNull()
  })

  test('pop preserves key bytes exactly', () => {
    const priv = new Uint8Array(32)
    for (let i = 0; i < 32; i++) priv[i] = i
    const pub = new Uint8Array(65)
    pub[0] = 0x04
    for (let i = 1; i < 65; i++) pub[i] = i * 2

    const result = popKey(makePool([{ priv, pub }]))
    expect(Array.from(result.priv)).toEqual(Array.from(priv))
    expect(Array.from(result.pub)).toEqual(Array.from(pub))
  })

  test('second pop returns second key, not first', () => {
    const keys = [
      { priv: new Uint8Array(32).fill(0x11), pub: new Uint8Array(65).fill(0x22) },
      { priv: new Uint8Array(32).fill(0x33), pub: new Uint8Array(65).fill(0x44) },
      { priv: new Uint8Array(32).fill(0x55), pub: new Uint8Array(65).fill(0x66) },
    ]
    const first  = popKey(makePool(keys))
    const second = popKey(first.remaining)
    expect(second.priv[0]).toBe(0x33)
    expect(second.pub[0]).toBe(0x44)
    expect(poolSize(second.remaining)).toBe(1)
  })

  test('pool is valid binary (all char codes 0-255)', () => {
    const keys = [{ priv: new Uint8Array(32).fill(0xab), pub: new Uint8Array(65).fill(0xcd) }]
    const pool = makePool(keys)
    for (let i = 0; i < pool.length; i++) {
      expect(pool.charCodeAt(i)).toBeGreaterThanOrEqual(0)
      expect(pool.charCodeAt(i)).toBeLessThanOrEqual(255)
    }
  })
})

// ── generateKeyPool (phone side, binary format) ────────────────────────

describe('BLECryptoSession.generateKeyPool', () => {
  test('returns success=true and a pool string', () => {
    const result = bleCryptoSession.generateKeyPool(2)
    expect(result.success).toBe(true)
    expect(typeof result.pool).toBe('string')
    expect(result.pool.length).toBeGreaterThan(0)
  })

  test('generates correct number of keys (default 5) — binary length = 5 × 97', () => {
    expect(bleCryptoSession.generateKeyPool(5).pool.length).toBe(5 * 97)
  })

  test('generates correct number of keys (count=1) — binary length = 97', () => {
    expect(bleCryptoSession.generateKeyPool(1).pool.length).toBe(97)
  })

  test('pool is a valid binary string (all char codes 0-255)', () => {
    const pool = bleCryptoSession.generateKeyPool(3).pool
    for (let i = 0; i < pool.length; i++) {
      const code = pool.charCodeAt(i)
      expect(code).toBeGreaterThanOrEqual(0)
      expect(code).toBeLessThanOrEqual(255)
    }
  })

  test('private key is first 32 bytes, non-zero', () => {
    const pool = bleCryptoSession.generateKeyPool(1).pool
    const priv = new Uint8Array(32)
    for (let i = 0; i < 32; i++) priv[i] = pool.charCodeAt(i)
    expect(priv.some(b => b !== 0)).toBe(true)
  })

  test('public key is bytes 32–97, starts with 04 (uncompressed point)', () => {
    const pool = bleCryptoSession.generateKeyPool(1).pool
    const pub = new Uint8Array(65)
    for (let i = 0; i < 65; i++) pub[i] = pool.charCodeAt(32 + i)
    expect(pub[0]).toBe(0x04)
    expect(pub.length).toBe(65)
  })

  test('each call generates different keys', () => {
    const a = bleCryptoSession.generateKeyPool(1).pool
    const b = bleCryptoSession.generateKeyPool(1).pool
    expect(a).not.toBe(b)
  })

  test('generated keypair is on the P-256 curve (ecdhFixed succeeds)', async () => {
    const { ecdhFixed, bytesToBigInt } = await import('../lib/tesla-ble/crypto/p256.js')
    const pool = bleCryptoSession.generateKeyPool(1).pool
    // Pool is binary string: first 32 chars = private key bytes
    const priv = new Uint8Array(32)
    for (let i = 0; i < 32; i++) priv[i] = pool.charCodeAt(i) & 0xff

    // Build doublings table for BOB_PUB using BigInt (same as phone-side)
    const BOB_PUB = '047cf27b188d034f7e8a52380304b51ac3c08969e277f21b35a60b48fc4766997807775510db8ed040293d9ac69f7430dbba7dade63ce982299e04b79d227873d1'
    const Pm = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff')
    const Am = BigInt('0xffffffff00000001000000000000000000000000fffffffffffffffffffffffc')
    function modInvBig(a, m) {
      let [r, old_r] = [m, ((a % m) + m) % m], [s, old_s] = [0n, 1n]
      while (old_r !== 0n) { const q = r / old_r;[r, old_r] = [old_r, r - q * old_r];[s, old_s] = [old_s, s - q * old_s] }
      return ((s % m) + m) % m
    }
    function pointAdd([x1, y1], [x2, y2]) {
      if (x1 === 0n && y1 === 0n) return [x2, y2]
      if (x2 === 0n && y2 === 0n) return [x1, y1]
      if (x1 === x2) {
        if (y1 !== y2) return [0n, 0n]
        const lam = ((3n * x1 * x1 + Am) * modInvBig(2n * y1, Pm)) % Pm
        const x3 = ((lam * lam - 2n * x1) % Pm + Pm) % Pm
        return [x3, ((lam * (x1 - x3) - y1) % Pm + Pm) % Pm]
      }
      const lam = ((y2 - y1) * modInvBig(x2 - x1, Pm)) % Pm
      const x3 = ((lam * lam - x1 - x2) % Pm + Pm) % Pm
      return [x3, ((lam * (x1 - x3) - y1) % Pm + Pm) % Pm]
    }
    function bigToBytes(n) {
      const hex = n.toString(16).padStart(64, '0')
      const b = new Uint8Array(32)
      for (let i = 0; i < 32; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16)
      return b
    }
    let cur = [BigInt('0x' + BOB_PUB.slice(2, 66)), BigInt('0x' + BOB_PUB.slice(66, 130))]
    // Flat Uint32Array(256×16): entry i has x at [i*16..i*16+7], y at [i*16+8..i*16+15], LSW-first
    const table = new Uint32Array(256 * 16)
    for (let i = 0; i < 256; i++) {
      const xW = bytesToBigInt(bigToBytes(cur[0])), yW = bytesToBigInt(bigToBytes(cur[1]))
      const b = i * 16
      for (let j = 0; j < 8; j++) { table[b + j] = xW[j]; table[b + 8 + j] = yW[j] }
      if (i < 255) cur = pointAdd(cur, cur)
    }

    let threw = false
    try { ecdhFixed(priv, table) } catch (e) { threw = true; console.error(e) }
    expect(threw).toBe(false)
  })
}, 60000) // ECDH can take ~5s on slow machines

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

describe('TeslaSession._hmac pre-computed pads', () => {
  function hexToBytes(h) {
    const b = new Uint8Array(h.length / 2)
    for (let i = 0; i < h.length; i += 2) b[i / 2] = parseInt(h.substr(i, 2), 16)
    return b
  }

  function makeSession(keyHex) {
    const s = new TeslaSession()
    s.sessionKey = hexToBytes(keyHex)
    s._initHmacPads()
    return s
  }

  // RFC 4231 TC1: key=20×0x0b, data="Hi There"
  const TC1_KEY  = '0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'
  const TC1_DATA = new Uint8Array([0x48,0x69,0x20,0x54,0x68,0x65,0x72,0x65])
  const TC1_MAC  = 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'

  // RFC 4231 TC2: key="Jefe", data="what do ya want for nothing?"
  const TC2_KEY  = '4a656665'
  const TC2_STR  = 'what do ya want for nothing?'
  const TC2_DATA = new Uint8Array(TC2_STR.length).map((_, i) => TC2_STR.charCodeAt(i))
  const TC2_MAC  = '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'

  test('matches hmacSha256 for RFC 4231 TC1 (20-byte key)', () => {
    const s = makeSession(TC1_KEY)
    expect(bytesToHex(s._hmac(TC1_DATA))).toBe(TC1_MAC)
  })

  test('matches hmacSha256 output directly — TC1', () => {
    const s = makeSession(TC1_KEY)
    const expected = hmacSha256(hexToBytes(TC1_KEY), TC1_DATA)
    expect(s._hmac(TC1_DATA)).toEqual(expected)
  })

  test('matches hmacSha256 for RFC 4231 TC2 (4-byte key)', () => {
    const s = makeSession(TC2_KEY)
    expect(bytesToHex(s._hmac(TC2_DATA))).toBe(TC2_MAC)
  })

  test('16-byte session key (typical Tesla session)', () => {
    const key = new Uint8Array(16).fill(0xab)
    const s = new TeslaSession()
    s.sessionKey = key
    s._initHmacPads()
    const msg = new Uint8Array([1, 2, 3, 4, 5])
    expect(s._hmac(msg)).toEqual(hmacSha256(key, msg))
  })

  test('different messages produce different MACs', () => {
    const s = makeSession('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b')
    const r1 = bytesToHex(s._hmac(new Uint8Array([1, 2, 3])))
    const r2 = bytesToHex(s._hmac(new Uint8Array([4, 5, 6])))
    expect(r1).not.toBe(r2)
  })

  test('pads null before _initHmacPads called', () => {
    const s = new TeslaSession()
    expect(s._hmacInner).toBeNull()
    expect(s._hmacOuter).toBeNull()
  })

  test('pads cleared on reset()', () => {
    const s = makeSession('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b')
    expect(s._hmacInner).not.toBeNull()
    s.reset()
    expect(s._hmacInner).toBeNull()
    expect(s._hmacOuter).toBeNull()
  })

  test('pads re-initialized after restorePreservedSession', () => {
    const s = makeSession('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b')
    s.established = true
    s.counter = 5
    s.preserveForReconnect(60000)
    // Simulate disconnect: clear active state but keep preserved (don't call reset)
    s.sessionKey = null
    s._hmacInner = null
    s._hmacOuter = null
    s.established = false
    expect(s._hmacInner).toBeNull()
    s.restorePreservedSession()
    expect(s._hmacInner).not.toBeNull()
    expect(s._hmacOuter).not.toBeNull()
    // pads must produce correct HMAC after restore
    const msg = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    expect(s._hmac(msg)).toEqual(hmacSha256(hexToBytes('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'), msg))
  })

  test('inner pad is sessionKey XOR 0x36, outer pad is sessionKey XOR 0x5c', () => {
    const key = new Uint8Array(16).fill(0x42)
    const s = new TeslaSession()
    s.sessionKey = key
    s._initHmacPads()
    // First 16 bytes: key XOR constant; remaining 48 bytes: 0x00 XOR constant
    for (let i = 0; i < 64; i++) {
      const k = i < 16 ? 0x42 : 0x00
      expect(s._hmacInner[i]).toBe(k ^ 0x36)
      expect(s._hmacOuter[i]).toBe(k ^ 0x5c)
    }
  })
})
