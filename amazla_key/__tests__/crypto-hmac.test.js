// HMAC-SHA256, SHA-256, and SHA-1 correctness tests
// Vectors verified against Node.js crypto module and RFC 3174 / RFC 4231

import { createHmac } from '../lib/tesla-ble/crypto/hmac.js'
import { hexToBytes, bytesToHex } from '../lib/tesla-ble/crypto/binary-utils.js'
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

  // 55 bytes fits exactly in one block (55+1+0+8=64); 56 bytes spills into two blocks
  test('55-byte input — single block boundary (NIST)', () => {
    const input = new Uint8Array(55).fill(0x61)
    expect(bytesToHex(sha256(input))).toBe(
      '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318'
    )
  })

  // NIST FIPS 180-4 multi-block vector — exercises processBlock called twice
  test('56-byte input — two blocks (NIST)', () => {
    const s = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'
    const input = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) input[i] = s.charCodeAt(i)
    expect(bytesToHex(sha256(input))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    )
  })

  // Exercises processBlock called multiple times — catches _W state leakage between blocks
  test('large input — many blocks', () => {
    const input = new Uint8Array(1000).fill(0x61) // 1000 × 'a'
    expect(bytesToHex(sha256(input))).toBe(
      '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3'
    )
  })

  // Catches _W leakage between successive calls (key risk of module-scope buffer reuse)
  test('back-to-back calls return independent correct results', () => {
    const a = new Uint8Array([0x61, 0x62, 0x63])
    const b = new Uint8Array([0x64, 0x65, 0x66])
    const hashA = bytesToHex(sha256(a))
    const hashB = bytesToHex(sha256(b))
    expect(hashA).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hashB).toBe('cb8379ac2098aa165029e3938a51da0bcecfc008fd6795f401178647f96c5b34')
  })

  test('string input matches Uint8Array input', () => {
    const asString = 'abc'
    const asBytes  = new Uint8Array([0x61, 0x62, 0x63])
    expect(bytesToHex(sha256(asString))).toBe(bytesToHex(sha256(asBytes)))
  })

  test('ArrayBuffer input', () => {
    const buf = new Uint8Array([0x61, 0x62, 0x63]).buffer
    expect(bytesToHex(sha256(buf))).toBe(
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

  test('"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq" — multi-block', () => {
    const s = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'
    const input = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) input[i] = s.charCodeAt(i)
    expect(bytesToHex(sha1(input))).toBe('84983e441c3bd26ebaae4aa1f95129e5e54670f1')
  })

  test('large input — many blocks', () => {
    const input = new Uint8Array(1000).fill(0x61)
    expect(bytesToHex(sha1(input))).toBe('291e9a6c66994949b57ba5e650361e98fc36b1ba')
  })

  // Catches _W1 state leakage between successive calls
  test('back-to-back calls return independent correct results', () => {
    const a = new Uint8Array([0x61, 0x62, 0x63])
    const b = new Uint8Array([0x64, 0x65, 0x66])
    expect(bytesToHex(sha1(a))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
    expect(bytesToHex(sha1(b))).toBe('589c22335a381f122d129225f5c0ba3056ed5811')
  })

  test('string input matches Uint8Array input', () => {
    const asString = 'abc'
    const asBytes  = new Uint8Array([0x61, 0x62, 0x63])
    expect(bytesToHex(sha1(asString))).toBe(bytesToHex(sha1(asBytes)))
  })

  test('ArrayBuffer input', () => {
    const buf = new Uint8Array([0x61, 0x62, 0x63]).buffer
    expect(bytesToHex(sha1(buf))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
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
    const { hmac } = createHmac(key)
    expect(bytesToHex(hmac(data))).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'
    )
  })

  // RFC 4231 test case 2
  test('TC2: key="Jefe", data="what do ya want for nothing?"', () => {
    const key = new Uint8Array([0x4a, 0x65, 0x66, 0x65])
    const s = 'what do ya want for nothing?'
    const data = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) data[i] = s.charCodeAt(i)
    const { hmac } = createHmac(key)
    expect(bytesToHex(hmac(data))).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'
    )
  })

  test('returns 32 bytes', () => {
    const { hmac } = createHmac(new Uint8Array(16).fill(0x01))
    expect(hmac(new Uint8Array(8).fill(0x02)).length).toBe(32)
  })

  test('different keys produce different MACs', () => {
    const data = new Uint8Array([1, 2, 3, 4])
    const { hmac: h1 } = createHmac(new Uint8Array(16).fill(0x01))
    const { hmac: h2 } = createHmac(new Uint8Array(16).fill(0x02))
    expect(bytesToHex(h1(data))).not.toBe(bytesToHex(h2(data)))
  })

  test('different data produces different MACs', () => {
    const key = new Uint8Array(16).fill(0x42)
    const { hmac } = createHmac(key)
    const mac1 = hmac(new Uint8Array([1, 2, 3]))
    const mac2 = hmac(new Uint8Array([1, 2, 4]))
    expect(bytesToHex(mac1)).not.toBe(bytesToHex(mac2))
  })

  test('deterministic', () => {
    const key  = new Uint8Array(16).fill(0x55)
    const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    const { hmac } = createHmac(key)
    expect(bytesToHex(hmac(data))).toBe(bytesToHex(hmac(data)))
  })
})

