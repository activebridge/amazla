// P-256 ECDH correctness tests
// Adapted from test-p256.js (which was a standalone script) into Jest format.
// Public keys computed from known private keys using BigInt P-256 (phone-side).

import { ecdhFixed, bytesToBigInt } from '../lib/tesla-ble/crypto/p256.js'
import { sha1 } from '../lib/tesla-ble/crypto/sha256.js'

import { hexToBytes, bytesToHex } from '../lib/tesla-ble/crypto/binary-utils.js'

// Pre-computed test keypairs (private → public, derived with BigInt P-256)
const ALICE_PRIV = 'c9afa9d845ba75166b5c215767b1d6934e50c3db36e89b127b8a622b120f6721'
const ALICE_PUB  = '0460fed4ba255a9d31c961eb74c6356d68c049b8923b61fa6ce669622e60f29fb6' +
                   '7903fe1008b8bc99a41ae9e95628bc64f2f1b20c2d7e9f5177a3c294d4462299'

const BOB_PRIV = '0000000000000000000000000000000000000000000000000000000000000002'
const BOB_PUB  = '047cf27b188d034f7e8a52380304b51ac3c08969e277f21b35a60b48fc47669978' +
                 '07775510db8ed040293d9ac69f7430dbba7dade63ce982299e04b79d227873d1'

// Shared secret = x-coordinate of scalar * peer_pubkey
// Both directions must yield the same 32-byte value.
const SHARED_SECRET_HEX = 'ed3687f8bd593c3d260ead3cbf2d4ac102e1e845e1f58da14343c20e6b1a3d4b'


// Build doublings table for a point given as hex (65-byte uncompressed, big-endian)
// This mirrors what the phone does in buildDoublingsTable()
function buildDoublingsTableJS(pubKeyHex) {
  // Use BigInt P-256 to compute 2^i * Q for i = 0..255
  const P = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff')
  const A = BigInt('0xffffffff00000001000000000000000000000000fffffffffffffffffffffffc')
  function modInvBig(a, m) {
    let [r, old_r] = [m, ((a % m) + m) % m], [s, old_s] = [0n, 1n]
    while (old_r !== 0n) {
      const q = r / old_r;
      [r, old_r] = [old_r, r - q * old_r];
      [s, old_s] = [old_s, s - q * old_s]
    }
    return ((s % m) + m) % m
  }
  function pointAdd([x1, y1], [x2, y2]) {
    if (x1 === 0n && y1 === 0n) return [x2, y2]
    if (x2 === 0n && y2 === 0n) return [x1, y1]
    if (x1 === x2) {
      if (y1 !== y2) return [0n, 0n]
      const lam = ((3n * x1 * x1 + A) * modInvBig(2n * y1, P)) % P
      const x3 = ((lam * lam - 2n * x1) % P + P) % P
      return [x3, ((lam * (x1 - x3) - y1) % P + P) % P]
    }
    const lam = ((y2 - y1) * modInvBig(x2 - x1, P)) % P
    const x3 = ((lam * lam - x1 - x2) % P + P) % P
    return [x3, ((lam * (x1 - x3) - y1) % P + P) % P]
  }
  function bigToBytes(n) {
    const hex = n.toString(16).padStart(64, '0')
    const b = new Uint8Array(32)
    for (let i = 0; i < 32; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16)
    return b
  }
  const xHex = pubKeyHex.slice(2, 66), yHex = pubKeyHex.slice(66, 130)
  let cur = [BigInt('0x' + xHex), BigInt('0x' + yHex)]
  // Flat Uint32Array(256×16): entry i has x at [i*16..i*16+7], y at [i*16+8..i*16+15], LSW-first
  const table = new Uint32Array(256 * 16)
  for (let i = 0; i < 256; i++) {
    const xWords = bytesToBigInt(bigToBytes(cur[0]))
    const yWords = bytesToBigInt(bigToBytes(cur[1]))
    const b = i * 16
    for (let j = 0; j < 8; j++) { table[b + j] = xWords[j]; table[b + 8 + j] = yWords[j] }
    if (i < 255) cur = pointAdd(cur, cur)
  }
  return table
}

describe('ecdhFixed (fixed-base ECDH with doublings table)', () => {
  test('ecdhFixed matches known shared secret for alice_priv × bob_pub', () => {
    const table = buildDoublingsTableJS(BOB_PUB)
    const fast = ecdhFixed(hexToBytes(ALICE_PRIV), table)
    expect(bytesToHex(fast)).toBe(SHARED_SECRET_HEX)
  })

  test('ecdhFixed produces known shared secret', () => {
    const table = buildDoublingsTableJS(BOB_PUB)
    const shared = ecdhFixed(hexToBytes(ALICE_PRIV), table)
    expect(bytesToHex(shared)).toBe(SHARED_SECRET_HEX)
  })

  test('ecdhFixed symmetry: bob_priv × alice_pub table matches alice_priv × bob_pub', () => {
    const tableAlice = buildDoublingsTableJS(ALICE_PUB)
    const tableBob   = buildDoublingsTableJS(BOB_PUB)
    const r1 = ecdhFixed(hexToBytes(BOB_PRIV), tableAlice)
    const r2 = ecdhFixed(hexToBytes(ALICE_PRIV), tableBob)
    expect(bytesToHex(r1)).toBe(bytesToHex(r2))
  })

  test('ecdhFixed returns 32 bytes', () => {
    const table = buildDoublingsTableJS(BOB_PUB)
    const shared = ecdhFixed(hexToBytes(ALICE_PRIV), table)
    expect(shared).toBeInstanceOf(Uint8Array)
    expect(shared.length).toBe(32)
  })
})

describe('Tesla session key derivation (ECDH → SHA1 → slice)', () => {
  test('session_key = SHA1(shared_x)[0:16] produces known 16-byte key', () => {
    // This is the exact chain in session.js:
    //   sharedSecret = ecdh(ephemeralPriv, vehiclePub)
    //   keyMaterial  = sha1(sharedSecret)
    //   sessionKey   = keyMaterial.slice(0, 16)
    const sharedX  = hexToBytes(SHARED_SECRET_HEX)
    const sessionKey = sha1(sharedX).slice(0, 16)
    expect(sessionKey.length).toBe(16)
    expect(bytesToHex(sessionKey)).toBe('6f11b3c24c94b5faac2d2a6964339d9c')
  })

  test('full chain: ecdhFixed → sha1 → slice matches precomputed value', () => {
    const table      = buildDoublingsTableJS(BOB_PUB)
    const sharedX    = ecdhFixed(hexToBytes(ALICE_PRIV), table)
    const sessionKey = sha1(sharedX).slice(0, 16)
    expect(bytesToHex(sessionKey)).toBe('6f11b3c24c94b5faac2d2a6964339d9c')
  })
})
