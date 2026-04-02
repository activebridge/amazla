// P-256 ECDH correctness tests
// Adapted from test-p256.js (which was a standalone script) into Jest format.
// Public keys computed from known private keys using BigInt P-256 (phone-side).

import { ecdh } from '../lib/tesla-ble/crypto/p256.js'
import { sha1 } from '../lib/tesla-ble/crypto/sha256.js'

function hexToBytes(hex) {
  const b = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) b[i / 2] = parseInt(hex.substr(i, 2), 16)
  return b
}
function bytesToHex(b) {
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
}

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

describe('P-256 ECDH', () => {
  test('alice ecdh(alice_priv, bob_pub) produces correct shared secret', () => {
    const shared = ecdh(hexToBytes(ALICE_PRIV), hexToBytes(BOB_PUB))
    expect(bytesToHex(shared)).toBe(SHARED_SECRET_HEX)
  })

  test('bob ecdh(bob_priv, alice_pub) produces same shared secret', () => {
    const shared = ecdh(hexToBytes(BOB_PRIV), hexToBytes(ALICE_PUB))
    expect(bytesToHex(shared)).toBe(SHARED_SECRET_HEX)
  })

  test('symmetry: both sides always produce the same x-coordinate', () => {
    const aliceShared = ecdh(hexToBytes(ALICE_PRIV), hexToBytes(BOB_PUB))
    const bobShared   = ecdh(hexToBytes(BOB_PRIV), hexToBytes(ALICE_PUB))
    expect(bytesToHex(aliceShared)).toBe(bytesToHex(bobShared))
  })

  test('returns 32 bytes (x-coordinate only)', () => {
    const shared = ecdh(hexToBytes(ALICE_PRIV), hexToBytes(BOB_PUB))
    expect(shared).toBeInstanceOf(Uint8Array)
    expect(shared.length).toBe(32)
  })

  test('different private keys produce different shared secrets', () => {
    const priv2 = hexToBytes('0000000000000000000000000000000000000000000000000000000000000003')
    // pub for privKey=3 (3*G), x = 5ecbe4d1a6330a44c8f7ef951d4bf165e6c6b721efada985fb41661bc6e7fd6
    const pub3  = hexToBytes('045ecbe4d1a6330a44c8f7ef951d4bf165e6c6b721efada985fb41661bc6e7fd6c' +
                             '8734640c4998ff7e374b06ce1a64a2ecd82ab036384fb83d9a79b127a27d5032')
    const shared1 = ecdh(hexToBytes(ALICE_PRIV), hexToBytes(BOB_PUB))
    const shared2 = ecdh(hexToBytes(ALICE_PRIV), pub3)
    expect(bytesToHex(shared1)).not.toBe(bytesToHex(shared2))
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

  test('full chain: ecdh → sha1 → slice matches precomputed value', () => {
    const sharedX   = ecdh(hexToBytes(ALICE_PRIV), hexToBytes(BOB_PUB))
    const sessionKey = sha1(sharedX).slice(0, 16)
    expect(bytesToHex(sessionKey)).toBe('6f11b3c24c94b5faac2d2a6964339d9c')
  })
})
