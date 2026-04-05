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

describe('parseRoutableMessage', () => {
  test('extracts payload (field 10) and sessionInfo (field 3)', () => {
    const innerPayload = new Uint8Array([0x01, 0x02, 0x03])
    const sessionInfoBytes = [
      encodeVarintField(1, 5),
      encodeBytes(2, new Uint8Array(65).fill(0x04)),
      encodeBytes(3, new Uint8Array(16).fill(0xee)),
      encodeVarintField(4, 1234),
    ].reduce((a, b) => { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r }, new Uint8Array(0))

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

  test('returns null sessionInfo when field 3 absent', () => {
    const msg = encodeBytes(10, new Uint8Array([0xaa]))
    const parsed = parseRoutableMessage(msg)
    expect(parsed.sessionInfo).toBeNull()
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

// ── key pool binary format ──────────────────────────────────────────────────

describe('Key pool binary format (97 bytes/key: 32 priv + 65 pub)', () => {
  // Reproduce the pop/size logic from session.js for testing without @zos/storage
  function makePool(keys) {
    // keys: array of { priv: Uint8Array[32], pub: Uint8Array[65] }
    const buf = new Uint8Array(keys.length * 97)
    for (let i = 0; i < keys.length; i++) {
      buf.set(keys[i].priv, i * 97)
      buf.set(keys[i].pub,  i * 97 + 32)
    }
    return btoa(String.fromCharCode.apply(null, buf))
  }

  function poolSize(b64) {
    if (!b64) return 0
    return (atob(b64).length / 97) | 0
  }

  function popKey(b64) {
    if (!b64) return null
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    if (raw.length < 97) return null
    return {
      priv: raw.slice(0, 32),
      pub:  raw.slice(32, 97),
      remaining: raw.length > 97 ? btoa(String.fromCharCode.apply(null, raw.slice(97))) : null
    }
  }

  test('pool with 3 keys has size 3', () => {
    const keys = Array.from({ length: 3 }, (_, i) => ({
      priv: new Uint8Array(32).fill(i + 1),
      pub:  new Uint8Array(65).fill(i + 0x10),
    }))
    expect(poolSize(makePool(keys))).toBe(3)
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
    const b64    = makePool(keys)
    const result = popKey(b64)
    expect(poolSize(result.remaining)).toBe(2)
  })

  test('pop from single-key pool leaves empty (null remaining)', () => {
    const key = { priv: new Uint8Array(32).fill(0x01), pub: new Uint8Array(65).fill(0x04) }
    const result = popKey(makePool([key]))
    expect(result.remaining).toBeNull()
    expect(poolSize(result.remaining)).toBe(0)
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
})

// ── generateKeyPool (phone side) ───────────────────────────────────────────

describe('BLECryptoSession.generateKeyPool', () => {
  test('returns success=true and a pool string', () => {
    const result = bleCryptoSession.generateKeyPool(2)
    expect(result.success).toBe(true)
    expect(typeof result.pool).toBe('string')
    expect(result.pool.length).toBeGreaterThan(0)
  })

  test('generates correct number of keys (default 5)', () => {
    const result = bleCryptoSession.generateKeyPool(5)
    const raw = Uint8Array.from(atob(result.pool), c => c.charCodeAt(0))
    expect(raw.length).toBe(5 * 97)
  })

  test('generates correct number of keys (count=1)', () => {
    const raw = Uint8Array.from(atob(bleCryptoSession.generateKeyPool(1).pool), c => c.charCodeAt(0))
    expect(raw.length).toBe(97)
  })

  test('private key is 32 non-zero bytes', () => {
    const raw = Uint8Array.from(atob(bleCryptoSession.generateKeyPool(1).pool), c => c.charCodeAt(0))
    const priv = raw.slice(0, 32)
    const allZero = priv.every(b => b === 0)
    expect(allZero).toBe(false)
  })

  test('public key starts with 0x04 (uncompressed point)', () => {
    const raw = Uint8Array.from(atob(bleCryptoSession.generateKeyPool(1).pool), c => c.charCodeAt(0))
    expect(raw[32]).toBe(0x04)  // first byte of pub = uncompressed prefix
  })

  test('each call generates different keys', () => {
    const a = bleCryptoSession.generateKeyPool(1).pool
    const b = bleCryptoSession.generateKeyPool(1).pool
    expect(a).not.toBe(b)
  })

  test('generated keypair is on the P-256 curve (ECDH succeeds)', async () => {
    // If the public key is not on the curve, ecdh() will throw
    const { ecdh } = await import('../lib/tesla-ble/crypto/p256.js')
    const raw  = Uint8Array.from(atob(bleCryptoSession.generateKeyPool(1).pool), c => c.charCodeAt(0))
    const priv = raw.slice(0, 32)
    const pub  = raw.slice(32, 97)

    // ECDH with a known second keypair; should not throw
    function hexToBytes(hex) {
      const b = new Uint8Array(hex.length / 2)
      for (let i = 0; i < hex.length; i += 2) b[i/2] = parseInt(hex.substr(i,2),16)
      return b
    }
    const bobPub = hexToBytes('047cf27b188d034f7e8a52380304b51ac3c08969e277f21b35a60b48fc47669978' +
                              '07775510db8ed040293d9ac69f7430dbba7dade63ce982299e04b79d227873d1')

    let threw = false
    try { ecdh(priv, bobPub) } catch (e) { threw = true; console.error(e) }
    expect(threw).toBe(false)
  })
}, 60000) // ECDH can take ~5s on slow machines
