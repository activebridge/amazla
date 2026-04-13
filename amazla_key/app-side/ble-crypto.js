// Tesla BLE Crypto Handler for App-Side
// Builds VCSEC protobuf messages for pairing (key enrollment) only.
// Also generates ephemeral P-256 keypair pools for watch-side passive entry.

import { bytesToHex, bytesToBinaryString, hexToBytes, binaryStringToBytes } from '../lib/tesla-ble/crypto/binary-utils.js'

// ============================================
// P-256 keypair generation (BigInt, phone-side only)
// ============================================

const P256_P  = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff')
const P256_A  = BigInt('0xffffffff00000001000000000000000000000000fffffffffffffffffffffffc')
const P256_N  = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551')
const P256_GX = BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296')
const P256_GY = BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')

function p256mod(a, m) { return ((a % m) + m) % m }

function p256modInv(a, m) {
  if (a < 0n) a = p256mod(a, m)
  let [old_r, r] = [a, m], [old_s, s] = [1n, 0n]
  while (r !== 0n) {
    const q = old_r / r
    ;[old_r, r] = [r, old_r - q * r]
    ;[old_s, s] = [s, old_s - q * s]
  }
  if (old_s < 0n) old_s += m
  return old_s
}

function p256PointAdd([x1, y1], [x2, y2]) {
  if (x1 === 0n && y1 === 0n) return [x2, y2]
  if (x2 === 0n && y2 === 0n) return [x1, y1]
  if (x1 === x2) {
    if (y1 !== y2) return [0n, 0n]
    const lam = ((3n * x1 * x1 + P256_A) * p256modInv(2n * y1, P256_P)) % P256_P
    const x3 = p256mod(lam * lam - 2n * x1, P256_P)
    return [x3, p256mod(lam * (x1 - x3) - y1, P256_P)]
  }
  const lam = ((y2 - y1) * p256modInv(x2 - x1, P256_P)) % P256_P
  const x3 = p256mod(lam * lam - x1 - x2, P256_P)
  return [p256mod(x3, P256_P), p256mod(lam * (x1 - x3) - y1, P256_P)]
}

function p256ScalarMul(k, point) {
  let result = [0n, 0n], addend = [...point]
  while (k > 0n) {
    if (k & 1n) result = p256PointAdd(result, addend)
    addend = p256PointAdd(addend, addend)
    k >>= 1n
  }
  return result
}

function bigIntToBytes32(n) {
  const hex = n.toString(16).padStart(64, '0')
  const b = new Uint8Array(32)
  for (let i = 0; i < 32; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16)
  return b
}

// ============================================
// Protobuf encoding helpers
// ============================================

import { encodeVarint, encodeBytes, encodeEnum, encodeVarintField, concat, encodeFixed32 } from '../lib/tesla-ble/protocol/protobuf.js'

// ============================================
// Tesla VCSEC Protocol Constants
// ============================================

const DOMAIN_VEHICLE_SECURITY = 2
const SIGNATURE_TYPE_PRESENT_KEY = 2  // No HMAC needed for pairing

// Key form factors (vcsec.proto KeyFormFactor enum — DO NOT CHANGE)
const KEY_FORM_FACTOR_ANDROID_DEVICE = 7  // Triggers NFC keycard tap UI on car touchscreen

// Key roles (keys.proto Role enum — DO NOT CHANGE)
const ROLE_OWNER = 2  // ROLE_SERVICE=1, ROLE_OWNER=2, ROLE_DRIVER=3

// ============================================
// Tesla VCSEC Message Builders
// ============================================

function buildPublicKey(publicKeyBytes) {
  // PublicKey { PublicKeyRaw (field 1) = bytes }
  return encodeBytes(1, publicKeyBytes)
}

function buildKeyMetadata(keyFormFactor) {
  // KeyMetadata { keyFormFactor (field 1) = enum }
  return encodeEnum(1, keyFormFactor)
}

// SignedMessage has ONLY fields 2 and 3 per vcsec.proto (verified from Tesla Go SDK).
// For pairing (PRESENT_KEY) we only use these two fields anyway.
function buildSignedMessage(options) {
  const parts = []
  if (options.payload) parts.push(encodeBytes(2, options.payload))
  if (options.signatureType !== undefined) parts.push(encodeEnum(3, options.signatureType))
  return concat(...parts)
}

function buildToVCSECMessage(signedMessage) {
  // ToVCSECMessage { signedMessage (field 1) }
  return encodeBytes(1, signedMessage)
}

// ============================================
// Pairing Message Builders
// ============================================

class BLECryptoSession {
  // Build pairing message: enrolls our public key into the Tesla whitelist.
  // Wire format: ToVCSECMessage > SignedMessage(PRESENT_KEY) > UnsignedMessage > WhitelistOperation
  // Returns binary string instead of hex for 50% transport reduction
  buildPairMessage(publicKeyBinary) {
    const publicKeyBytes = binaryStringToBytes(publicKeyBinary)

    // PublicKey { PublicKeyRaw (field 1) = 65 bytes }
    const publicKeyMsg = buildPublicKey(publicKeyBytes)

    // PermissionChange { key (field 1), keyRole (field 4) = ROLE_OWNER }
    // keys.proto: ROLE_SERVICE=1, ROLE_OWNER=2, ROLE_DRIVER=3 — DO NOT CHANGE
    const permissionChange = concat(
      encodeBytes(1, publicKeyMsg),
      encodeEnum(4, ROLE_OWNER)
    )

    // WhitelistOperation:
    //   addKeyToWhitelistAndAddPermissions (field 5) = PermissionChange — DO NOT CHANGE TO FIELD 1
    //   metadataForKey (field 6) = KeyMetadata — DO NOT CHANGE TO FIELD 16
    const metadata = buildKeyMetadata(KEY_FORM_FACTOR_ANDROID_DEVICE)
    const whitelistOp = concat(
      encodeBytes(5, permissionChange),
      encodeBytes(6, metadata)
    )

    // UnsignedMessage { WhitelistOperation (field 16) }
    const unsignedMessage = encodeBytes(16, whitelistOp)

    // SignedMessage { payload (field 2), signatureType (field 3) = PRESENT_KEY }
    const signedMsg = buildSignedMessage({
      payload: unsignedMessage,
      signatureType: SIGNATURE_TYPE_PRESENT_KEY
    })

    const messageBytes = buildToVCSECMessage(signedMsg)
    return {
      success: true,
      message: bytesToBinaryString(messageBytes)
    }
  }

  // Generate N ephemeral P-256 keypairs for watch key pool.
  // Returns binary string: N × 97 bytes per key (32 priv + 65 pub).
  // Binary format: 50% storage reduction vs hex, direct byte slicing on watch.
  // Watch stores this directly and pops one key (97 bytes) per session.
  generateKeyPool(count) {
    const n = count || 5
    let pool = ''

    for (let i = 0; i < n; i++) {
      // Generate random 32-byte scalar in [1, n-1]
      const privRaw = new Uint8Array(32)
      for (let j = 0; j < 32; j++) privRaw[j] = Math.floor(Math.random() * 256)
      let k = BigInt('0x' + bytesToHex(privRaw)) % P256_N
      if (k === 0n) k = 1n
      const privBytes = bigIntToBytes32(k)

      // Compute public key: k * G → uncompressed 04 || x || y (65 bytes)
      const pt = p256ScalarMul(k, [P256_GX, P256_GY])
      const pubBytes = new Uint8Array(65)
      pubBytes[0] = 0x04
      pubBytes.set(bigIntToBytes32(pt[0]), 1)
      pubBytes.set(bigIntToBytes32(pt[1]), 33)

      // Store as binary string (97 bytes per key: 32 priv + 65 pub)
      pool += bytesToBinaryString(privBytes) + bytesToBinaryString(pubBytes)
    }

    return { success: true, pool }
  }

  // Precompute doublings table for vehicle's fixed public key.
  // Returns ArrayBuffer: 256 entries × 64 bytes = 16384 bytes.
  // Phone does this once during pairing; watch stores it as binary for fast fixed-base ECDH.
  buildDoublingsTable(vehiclePublicKeyBinary) {
    try {
      if (vehiclePublicKeyBinary.length !== 65) {
        return { success: false, error: 'Expected 65-byte uncompressed EC public key' }
      }
      let x = 0n, y = 0n
      for (let i = 0; i < 32; i++) {
        x = (x << 8n) | BigInt(vehiclePublicKeyBinary.charCodeAt(1 + i) & 0xff)
        y = (y << 8n) | BigInt(vehiclePublicKeyBinary.charCodeAt(33 + i) & 0xff)
      }
      let current = [x, y]

      // table[i] = 2^i * Q: Q, 2Q, 4Q, ..., 2^255*Q
      // Stored as Uint32Array(256×16): LSW-first uint32s, 8 words for x then 8 for y.
      // Pre-parsed here (V8) so the watch can view it directly without a parse loop.
      const table = new Uint32Array(256 * 16)
      for (let i = 0; i < 256; i++) {
        const xb = bigIntToBytes32(current[0])
        const yb = bigIntToBytes32(current[1])
        const tbase = i * 16
        for (let j = 0; j < 8; j++) {
          const bo = 28 - j * 4 // j=0 → LSW (bytes 28-31), j=7 → MSW (bytes 0-3)
          table[tbase + j]     = ((xb[bo] << 24) | (xb[bo+1] << 16) | (xb[bo+2] << 8) | xb[bo+3]) >>> 0
          table[tbase + 8 + j] = ((yb[bo] << 24) | (yb[bo+1] << 16) | (yb[bo+2] << 8) | yb[bo+3]) >>> 0
        }
        if (i < 255) current = p256PointAdd(current, current)
      }

      return { success: true, buffer: table.buffer }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // Build whitelist query: asks car if our public key is enrolled.
  // Wire format: ToVCSECMessage > SignedMessage(PRESENT_KEY) > UnsignedMessage(InformationRequest)
  // Car responds: FromVCSECMessage { whitelistEntryInfo (field 17) } if enrolled,
  //               FromVCSECMessage { commandStatus (field 4) } if not enrolled.
  // Returns binary string instead of hex for 50% transport reduction
  buildWhitelistQueryMessage(publicKeyBinary) {
    // InformationRequest { type (field 1) = GET_WHITELIST_ENTRY_INFO(6), slot (field 4) = 0 }
    // GET_WHITELIST_ENTRY_INFO = 6 — DO NOT CHANGE, verified from vcsec.proto InformationRequestType enum
    // Use slot=0 to fetch first/only enrolled key (Tesla SDK uses slot, not publicKey)
    const infoReq = concat(
      encodeEnum(1, 6),              // GET_WHITELIST_ENTRY_INFO = 6
      encodeVarintField(4, 0)        // slot = 0 (fetch first enrolled key)
    )

    // UnsignedMessage { InformationRequest (field 1) }
    // field 1 = InformationRequest — DO NOT CHANGE TO 4
    const unsignedMessage = encodeBytes(1, infoReq)

    const signedMsg = buildSignedMessage({
      payload: unsignedMessage,
      signatureType: SIGNATURE_TYPE_PRESENT_KEY
    })

    const messageBytes = buildToVCSECMessage(signedMsg)
    return {
      success: true,
      message: bytesToBinaryString(messageBytes)
    }
  }

  // Generate a new enrolled P-256 key pair, store it, and return public key for watch
  generateEnrolledKeyPair() {
    try {
      // Generate random 32-byte scalar in [1, n-1]
      const privRaw = new Uint8Array(32)
      for (let j = 0; j < 32; j++) privRaw[j] = Math.floor(Math.random() * 256)
      let k = BigInt('0x' + bytesToHex(privRaw)) % P256_N
      if (k === 0n) k = 1n
      const privBytes = bigIntToBytes32(k)
      const privKeyBinary = bytesToBinaryString(privBytes)

      // Compute public key: k * G → uncompressed 04 || x || y (65 bytes)
      const pt = p256ScalarMul(k, [P256_GX, P256_GY])
      const pubBytes = new Uint8Array(65)
      pubBytes[0] = 0x04
      pubBytes.set(bigIntToBytes32(pt[0]), 1)
      pubBytes.set(bigIntToBytes32(pt[1]), 33)
      const pubKeyBinary = bytesToBinaryString(pubBytes)

      console.log('[BLE] Generated new enrolled key pair')
      return {
        success: true,
        publicKeyBinary: pubKeyBinary,
        privateKeyBinary: privKeyBinary
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }
}

const bleCryptoSession = new BLECryptoSession()

export default bleCryptoSession
export { hexToBytes, bytesToHex, bytesToBinaryString, binaryStringToBytes }
