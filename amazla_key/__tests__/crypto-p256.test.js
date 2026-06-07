// P-256 ECDH correctness tests
// Validates the live phone-side ECDH (bleCrypto.computeSharedSecret) against
// known-answer vectors and a Node createECDH oracle. The old watch-side
// fixed-base path (ecdhFixed + buildDoublingsTable) was removed as dead code;
// the phone now computes the shared secret directly and the watch only derives
// sessionKey = sha1(secret)[0:16].

import bleCrypto, { bytesToBinaryString, binaryStringToBytes } from '../app-side/ble-crypto.js'
import { sha1 } from '../lib/tesla-ble/crypto/sha256.js'
import { hexToBytes, bytesToHex } from '../lib/tesla-ble/crypto/binary-utils.js'
import { createECDH } from 'crypto'

// Pre-computed test keypairs (private → public, derived with BigInt P-256)
const ALICE_PRIV = 'c9afa9d845ba75166b5c215767b1d6934e50c3db36e89b127b8a622b120f6721'
const ALICE_PUB  = '0460fed4ba255a9d31c961eb74c6356d68c049b8923b61fa6ce669622e60f29fb6' +
                   '7903fe1008b8bc99a41ae9e95628bc64f2f1b20c2d7e9f5177a3c294d4462299'

const BOB_PRIV = '0000000000000000000000000000000000000000000000000000000000000002'
const BOB_PUB  = '047cf27b188d034f7e8a52380304b51ac3c08969e277f21b35a60b48fc47669978' +
                 '07775510db8ed040293d9ac69f7430dbba7dade63ce982299e04b79d227873d1'

// Shared secret = x-coordinate of scalar * peer_pubkey.
// Both directions must yield the same 32-byte value.
const SHARED_SECRET_HEX = 'ed3687f8bd593c3d260ead3cbf2d4ac102e1e845e1f58da14343c20e6b1a3d4b'

// Run the live phone ECDH and return the 32-byte shared-secret X as bytes.
function sharedSecret(privHex, pubHex) {
  const r = bleCrypto.computeSharedSecret(
    bytesToBinaryString(hexToBytes(privHex)),
    bytesToBinaryString(hexToBytes(pubHex)),
  )
  expect(r.success).toBe(true)
  return binaryStringToBytes(r.secret)
}

describe('computeSharedSecret (phone-side P-256 ECDH)', () => {
  test('alice_priv × bob_pub matches known shared secret', () => {
    expect(bytesToHex(sharedSecret(ALICE_PRIV, BOB_PUB))).toBe(SHARED_SECRET_HEX)
  })

  test('symmetry: bob_priv × alice_pub equals alice_priv × bob_pub', () => {
    const r1 = bytesToHex(sharedSecret(BOB_PRIV, ALICE_PUB))
    const r2 = bytesToHex(sharedSecret(ALICE_PRIV, BOB_PUB))
    expect(r1).toBe(r2)
  })

  test('returns 32 bytes', () => {
    const shared = sharedSecret(ALICE_PRIV, BOB_PUB)
    expect(shared).toBeInstanceOf(Uint8Array)
    expect(shared.length).toBe(32)
  })

  test('rejects malformed key lengths', () => {
    expect(bleCrypto.computeSharedSecret('short', bytesToBinaryString(hexToBytes(BOB_PUB))).success).toBe(false)
    expect(bleCrypto.computeSharedSecret(bytesToBinaryString(hexToBytes(ALICE_PRIV)), 'short').success).toBe(false)
  })
})

describe('Tesla session key derivation (ECDH → SHA1 → slice)', () => {
  test('session_key = SHA1(shared_x)[0:16] produces known 16-byte key', () => {
    // The exact chain the watch runs after receiving the phone-computed secret:
    //   keyMaterial = sha1(sharedSecret); sessionKey = keyMaterial.slice(0, 16)
    const sessionKey = sha1(hexToBytes(SHARED_SECRET_HEX)).slice(0, 16)
    expect(sessionKey.length).toBe(16)
    expect(bytesToHex(sessionKey)).toBe('6f11b3c24c94b5faac2d2a6964339d9c')
  })

  test('full chain: computeSharedSecret → sha1 → slice matches precomputed value', () => {
    const sessionKey = sha1(sharedSecret(ALICE_PRIV, BOB_PUB)).slice(0, 16)
    expect(bytesToHex(sessionKey)).toBe('6f11b3c24c94b5faac2d2a6964339d9c')
  })
})

// ── Phone ECDH must agree with a trusted reference (Node createECDH) ───────────
// Drives the "drop the doublings table" change: the phone computes ECDH directly
// (no 16 KB table over BLE). Cross-check 5 random keypairs against Node's crypto.
const pad32 = (b) => { b = new Uint8Array(b); if (b.length === 32) return b; const o = new Uint8Array(32); o.set(b, 32 - b.length); return o }

describe('phone computeSharedSecret ≡ Node createECDH', () => {
  for (let i = 0; i < 5; i++) {
    test(`random keypair #${i + 1}`, () => {
      const veh = createECDH('prime256v1'); veh.generateKeys()
      const vehPub = new Uint8Array(veh.getPublicKey()) // 65B uncompressed
      const w = createECDH('prime256v1'); w.generateKeys()
      const wPriv = pad32(w.getPrivateKey())

      // Reference: Node computes the shared secret (X coordinate) directly.
      const secretRef = pad32(w.computeSecret(veh.getPublicKey()))
      const keyRef = sha1(secretRef).slice(0, 16)

      // Phone path: bleCrypto direct ECDH, returns the 32-byte shared secret X.
      const r = bleCrypto.computeSharedSecret(bytesToBinaryString(wPriv), bytesToBinaryString(vehPub))
      expect(r.success).toBe(true)
      const secretPhone = binaryStringToBytes(r.secret)
      const keyPhone = sha1(secretPhone).slice(0, 16)

      expect(Array.from(secretPhone)).toEqual(Array.from(secretRef))
      expect(Array.from(keyPhone)).toEqual(Array.from(keyRef))
    })
  }
})
