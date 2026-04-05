// HMAC-SHA256, SHA-256, and SHA-1 correctness tests
// Vectors verified against Node.js crypto module and RFC 3174 / RFC 4231

import { hmacSha256, hexToBytes, bytesToHex } from '../lib/tesla-ble/crypto/hmac.js'
import { sha1, sha256 } from '../lib/tesla-ble/crypto/sha256.js'

describe('SHA-256', () => {
  test('empty input', () => {
    expect(bytesToHex(sha256(new Uint8Array(0)))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })

  test('"abc"', () => {
    const input = new Uint8Array([0x61, 0x62, 0x63])
    expect(bytesToHex(sha256(input))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })

  test('returns 32 bytes', () => {
    expect(sha256(new Uint8Array([1, 2, 3])).length).toBe(32)
  })

  test('deterministic', () => {
    const input = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    expect(bytesToHex(sha256(input))).toBe(bytesToHex(sha256(input)))
  })
})

describe('SHA-1', () => {
  // RFC 3174 test vectors

  test('empty input', () => {
    expect(bytesToHex(sha1(new Uint8Array(0)))).toBe(
      'da39a3ee5e6b4b0d3255bfef95601890afd80709'
    )
  })

  test('"abc"', () => {
    const input = new Uint8Array([0x61, 0x62, 0x63])
    expect(bytesToHex(sha1(input))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
  })

  test('"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"', () => {
    const s = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'
    const input = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) input[i] = s.charCodeAt(i)
    expect(bytesToHex(sha1(input))).toBe('84983e441c3bd26ebaae4aa1f95129e5e54670f1')
  })

  test('returns 20 bytes', () => {
    expect(sha1(new Uint8Array([1, 2, 3])).length).toBe(20)
  })

  test('session key derivation: SHA1(x)[0:16] produces 16-byte key', () => {
    // Exact operation used in session.js: sessionKey = sha1(ecdhSharedX).slice(0, 16)
    const ecdhX = new Uint8Array(32).fill(0xab)
    const key = sha1(ecdhX).slice(0, 16)
    expect(key.length).toBe(16)
    expect(bytesToHex(key)).toBe('4c3381ad1bc214c08ebae4b8a29d2836')
  })
})

describe('HMAC-SHA256', () => {
  // RFC 4231 test case 1
  test('TC1: key=20×0x0b, data="Hi There"', () => {
    const key  = hexToBytes('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b')
    const data = new Uint8Array([0x48, 0x69, 0x20, 0x54, 0x68, 0x65, 0x72, 0x65])
    expect(bytesToHex(hmacSha256(key, data))).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'
    )
  })

  // RFC 4231 test case 2
  test('TC2: key="Jefe", data="what do ya want for nothing?"', () => {
    const key = new Uint8Array([0x4a, 0x65, 0x66, 0x65])
    const s = 'what do ya want for nothing?'
    const data = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) data[i] = s.charCodeAt(i)
    expect(bytesToHex(hmacSha256(key, data))).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'
    )
  })

  test('returns 32 bytes', () => {
    expect(hmacSha256(new Uint8Array(16).fill(0x01), new Uint8Array(8).fill(0x02)).length).toBe(32)
  })

  test('different keys produce different MACs', () => {
    const data = new Uint8Array([1, 2, 3, 4])
    const mac1 = hmacSha256(new Uint8Array(16).fill(0x01), data)
    const mac2 = hmacSha256(new Uint8Array(16).fill(0x02), data)
    expect(bytesToHex(mac1)).not.toBe(bytesToHex(mac2))
  })

  test('different data produces different MACs', () => {
    const key = new Uint8Array(16).fill(0x42)
    const mac1 = hmacSha256(key, new Uint8Array([1, 2, 3]))
    const mac2 = hmacSha256(key, new Uint8Array([1, 2, 4]))
    expect(bytesToHex(mac1)).not.toBe(bytesToHex(mac2))
  })

  test('deterministic', () => {
    const key  = new Uint8Array(16).fill(0x55)
    const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    expect(bytesToHex(hmacSha256(key, data))).toBe(bytesToHex(hmacSha256(key, data)))
  })
})
