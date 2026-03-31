// Tesla BLE Crypto Handler for App-Side (The "Brain")
// Handles all Protobuf encoding/decoding and P-256 ECC math for the watch

import * as constants from '../lib/tesla-ble/common/constants.js'

// ============================================
// Protobuf encoding helpers
// ============================================

function encodeVarint(value) {
  const bytes = []
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80)
    value >>>= 7
  }
  bytes.push(value & 0x7f)
  return new Uint8Array(bytes)
}

function encodeBytes(fieldNumber, data) {
  const key = encodeVarint((fieldNumber << 3) | 2)
  const length = encodeVarint(data.length)
  const result = new Uint8Array(key.length + length.length + data.length)
  result.set(key)
  result.set(length, key.length)
  result.set(data, key.length + length.length)
  return result
}

function encodeEnum(fieldNumber, value) {
  const key = encodeVarint((fieldNumber << 3) | 0)
  const val = encodeVarint(value)
  const result = new Uint8Array(key.length + val.length)
  result.set(key)
  result.set(val, key.length)
  return result
}

function concat(...arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + (arr ? arr.length : 0), 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    if (arr) {
      result.set(arr, offset)
      offset += arr.length
    }
  }
  return result
}

// ============================================
// Crypto helpers (P-256 ECC)
// ============================================

function hexToBytes(hex) {
  if (!hex) return new Uint8Array(0)
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

function bytesToHex(bytes) {
  if (!bytes) return ''
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function randomBytes(length) {
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return bytes
}

// SHA-256 implementation
function sha256(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]
  const rightrotate = (value, amount) => ((value >>> amount) | (value << (32 - amount))) >>> 0
  const msgLen = bytes.length
  const bitLen = msgLen * 8
  const padLen = (56 - (msgLen + 1) % 64 + 64) % 64
  const paddedLen = msgLen + 1 + padLen + 8
  const padded = new Uint8Array(paddedLen)
  padded.set(bytes); padded[msgLen] = 0x80
  const lenView = new DataView(padded.buffer, paddedLen - 8)
  lenView.setUint32(4, bitLen, false)
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19
  for (let i = 0; i < paddedLen; i += 64) {
    const w = new Array(64)
    const chunk = new DataView(padded.buffer, i, 64)
    for (let j = 0; j < 16; j++) w[j] = chunk.getUint32(j * 4, false)
    for (let j = 16; j < 64; j++) {
      const s0 = rightrotate(w[j-15], 7) ^ rightrotate(w[j-15], 18) ^ (w[j-15] >>> 3)
      const s1 = rightrotate(w[j-2], 17) ^ rightrotate(w[j-2], 19) ^ (w[j-2] >>> 10)
      w[j] = (w[j-16] + s0 + w[j-7] + s1) >>> 0
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7
    for (let j = 0; j < 64; j++) {
      const S1 = rightrotate(e, 6) ^ rightrotate(e, 11) ^ rightrotate(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K[j] + w[j]) >>> 0
      const S0 = rightrotate(a, 2) ^ rightrotate(a, 13) ^ rightrotate(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + temp1) >>> 0
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0
  }
  const result = new Uint8Array(32); const view = new DataView(result.buffer)
  view.setUint32(0, h0, false); view.setUint32(4, h1, false); view.setUint32(8, h2, false); view.setUint32(12, h3, false)
  view.setUint32(16, h4, false); view.setUint32(20, h5, false); view.setUint32(24, h6, false); view.setUint32(28, h7, false)
  return result
}

// SHA-1 for session key derivation
function sha1(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const leftrotate = (value, amount) => ((value << amount) | (value >>> (32 - amount))) >>> 0
  const msgLen = bytes.length
  const bitLen = msgLen * 8
  const padLen = (56 - (msgLen + 1) % 64 + 64) % 64
  const paddedLen = msgLen + 1 + padLen + 8
  const padded = new Uint8Array(paddedLen)
  padded.set(bytes); padded[msgLen] = 0x80
  const lenView = new DataView(padded.buffer, paddedLen - 8)
  lenView.setUint32(4, bitLen, false)
  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0
  for (let i = 0; i < paddedLen; i += 64) {
    const w = new Array(80); const chunk = new DataView(padded.buffer, i, 64)
    for (let j = 0; j < 16; j++) w[j] = chunk.getUint32(j * 4, false)
    for (let j = 16; j < 80; j++) w[j] = leftrotate(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1)
    let a = h0, b = h1, c = h2, d = h3, e = h4
    for (let j = 0; j < 80; j++) {
      let f, k
      if (j < 20) { f = (b & c) | ((~b) & d); k = 0x5A827999 }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1 }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC }
      else { f = b ^ c ^ d; k = 0xCA62C1D6 }
      const temp = (leftrotate(a, 5) + f + e + k + w[j]) >>> 0
      e = d; d = c; c = leftrotate(b, 30); b = a; a = temp
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0
  }
  const result = new Uint8Array(20); const view = new DataView(result.buffer)
  view.setUint32(0, h0, false); view.setUint32(4, h1, false); view.setUint32(8, h2, false); view.setUint32(12, h3, false); view.setUint32(16, h4, false)
  return result
}

// HMAC-SHA256
function hmacSha256(key, data) {
  const keyBytes = typeof key === 'string' ? new TextEncoder().encode(key) : key
  const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  let actualKey = keyBytes
  if (actualKey.length > 64) actualKey = sha256(actualKey)
  if (actualKey.length < 64) { const padded = new Uint8Array(64); padded.set(actualKey); actualKey = padded }
  const oKeyPad = new Uint8Array(64); const iKeyPad = new Uint8Array(64)
  for (let i = 0; i < 64; i++) { oKeyPad[i] = actualKey[i] ^ 0x5c; iKeyPad[i] = actualKey[i] ^ 0x36 }
  const inner = new Uint8Array(64 + dataBytes.length)
  inner.set(iKeyPad); inner.set(dataBytes, 64)
  const innerHash = sha256(inner)
  const outer = new Uint8Array(64 + 32)
  outer.set(oKeyPad); outer.set(innerHash, 64)
  return sha256(outer)
}

// ============================================
// P-256 Elliptic Curve (BigInt-based)
// ============================================

const P256_P = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff')
const P256_N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551')
const P256_A = BigInt('0xffffffff00000001000000000000000000000000fffffffffffffffffffffffc')
const P256_GX = BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296')
const P256_GY = BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')

function mod(a, m) { return ((a % m) + m) % m }
function modInverse(a, m) {
  if (a < 0n) a = mod(a, m)
  let [old_r, r] = [a, m]; let [old_s, s] = [1n, 0n]
  while (r !== 0n) { const quotient = old_r / r; [old_r, r] = [r, old_r - quotient * r]; [old_s, s] = [s, old_s - quotient * s] }
  if (old_r > 1n) throw new Error('Modular inverse does not exist'); if (old_s < 0n) old_s += m; return old_s
}
function pointAdd([x1, y1], [x2, y2]) {
  if (x1 === 0n && y1 === 0n) return [x2, y2]
  if (x2 === 0n && y2 === 0n) return [x1, y1]
  if (x1 === x2) { if (y1 === y2) return pointDouble([x1, y1]); return [0n, 0n] }
  const lambda = mod((y2 - y1) * modInverse(x2 - x1, P256_P), P256_P)
  const x3 = mod(lambda * lambda - x1 - x2, P256_P)
  const y3 = mod(lambda * (x1 - x3) - y1, P256_P)
  return [x3, y3]
}
function pointDouble([x, y]) {
  if (x === 0n && y === 0n) return [0n, 0n]
  const lambda = mod((3n * x * x + P256_A) * modInverse(2n * y, P256_P), P256_P)
  const x3 = mod(lambda * lambda - 2n * x, P256_P); const y3 = mod(lambda * (x - x3) - y, P256_P); return [x3, y3]
}
function pointMultiply(scalar, point) {
  if (scalar === 0n) return [0n, 0n]
  let result = [0n, 0n]; let addend = [...point]
  while (scalar > 0n) { if (scalar & 1n) result = pointAdd(result, addend); addend = pointDouble(addend); scalar >>= 1n }
  return result
}
function bigIntToBytes(bigint, length = 32) { return hexToBytes(bigint.toString(16).padStart(length * 2, '0')) }
function bytesToBigInt(bytes) { return BigInt('0x' + bytesToHex(bytes)) }

function generatePrivateKey() {
  const bytes = randomBytes(32); let k = bytesToBigInt(bytes); k = k % P256_N; if (k === 0n) k = 1n; return bigIntToBytes(k)
}
function getPublicKey(privateKeyBytes) {
  const k = bytesToBigInt(privateKeyBytes); const [x, y] = pointMultiply(k, [P256_GX, P256_GY])
  const result = new Uint8Array(65); result[0] = 0x04; result.set(bigIntToBytes(x), 1); result.set(bigIntToBytes(y), 33)
  return result
}
function ecdh(privateKeyBytes, publicKeyBytes) {
  const k = bytesToBigInt(privateKeyBytes); let pubX, pubY
  if (publicKeyBytes[0] === 0x04 && publicKeyBytes.length === 65) { pubX = bytesToBigInt(publicKeyBytes.slice(1, 33)); pubY = bytesToBigInt(publicKeyBytes.slice(33, 65)) }
  else if (publicKeyBytes.length === 64) { pubX = bytesToBigInt(publicKeyBytes.slice(0, 32)); pubY = bytesToBigInt(publicKeyBytes.slice(32, 64)) }
  else throw new Error('Invalid public key')
  const [x, _] = pointMultiply(k, [pubX, pubY]); return bigIntToBytes(x)
}

// ============================================
// Message Builders
// ============================================

function buildRoutableMessage(options) {
  const parts = []
  if (options.toDomain !== undefined) {
    const destination = encodeEnum(1, options.toDomain)
    parts.push(encodeBytes(6, destination))
  }
  if (options.routingAddress) {
    const destination = encodeBytes(2, options.routingAddress)
    parts.push(encodeBytes(7, destination))
  }
  if (options.payload) parts.push(encodeBytes(10, options.payload))
  if (options.sessionInfoRequest) parts.push(encodeBytes(14, options.sessionInfoRequest))
  if (options.uuid) parts.push(encodeBytes(50, options.uuid))
  return concat(...parts)
}

function buildSessionInfoRequest(publicKey, challenge) {
  const parts = []
  if (publicKey) parts.push(encodeBytes(1, publicKey))
  if (challenge) parts.push(encodeBytes(2, challenge))
  return concat(...parts)
}

function buildPublicKey(publicKeyBytes) {
  return encodeBytes(1, publicKeyBytes)
}

function buildKeyMetadata(keyFormFactor) {
  return encodeEnum(1, keyFormFactor)
}

function buildPermissionChange(publicKeyMsg, role) {
  return concat(
    encodeBytes(constants.PERM_FIELD_KEY, publicKeyMsg),
    encodeEnum(constants.PERM_FIELD_ROLE, role)
  )
}

function buildWhitelistOperation(publicKeyBytes, keyFormFactor = constants.KEY_FORM_FACTOR_ANDROID_DEVICE) {
  // Use Field 6 (addKey) for modern firmware
  const publicKeyMsg = buildPublicKey(publicKeyBytes)
  const permissionChange = buildPermissionChange(publicKeyMsg, constants.KEY_ROLE_OWNER)
  const metadata = buildKeyMetadata(keyFormFactor)

  return concat(
    encodeBytes(constants.WHITELIST_FIELD_ADD_KEY, permissionChange),
    encodeBytes(constants.WHITELIST_FIELD_METADATA, metadata)
  )
}

function buildUnsignedMessage(options) {
  const parts = []
  if (options.rkeAction !== undefined) {
    parts.push(encodeEnum(constants.UNSIGNED_FIELD_RKE_ACTION, options.rkeAction))
  }
  if (options.whitelistOp) {
    parts.push(encodeBytes(constants.UNSIGNED_FIELD_WHITELIST_OP, options.whitelistOp))
  }
  return concat(...parts)
}

function buildSignedMessage(options) {
  const parts = []
  if (options.payload) parts.push(encodeBytes(2, options.payload))
  if (options.signatureType !== undefined) parts.push(encodeEnum(3, options.signatureType))
  if (options.counter !== undefined) parts.push(encodeVarint(options.counter))
  if (options.signature) parts.push(encodeBytes(5, options.signature))
  if (options.epoch) parts.push(encodeBytes(6, options.epoch))
  if (options.expiresAt !== undefined) parts.push(encodeVarint(options.expiresAt))
  return concat(...parts)
}

function buildToVCSECMessage(signedMessage) {
  return encodeBytes(1, signedMessage)
}

// ============================================
// Response Decoder (The "Brain")
// ============================================

function decodeVarint(buffer, offset) {
  let value = 0; let shift = 0; let pos = offset
  while (pos < buffer.length) {
    const byte = buffer[pos++]; value |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) return { value, bytesRead: pos - offset }
    shift += 7
  }
  return null
}

function decodeMessage(buffer) {
  const fields = {}; let offset = 0
  while (offset < buffer.length) {
    const keyResult = decodeVarint(buffer, offset)
    if (!keyResult) break
    offset += keyResult.bytesRead
    const fieldNumber = keyResult.value >>> 3; const wireType = keyResult.value & 0x07
    let value
    if (wireType === 0) {
      const res = decodeVarint(buffer, offset)
      if (!res) break; value = res.value; offset += res.bytesRead
    } else if (wireType === 2) {
      const res = decodeVarint(buffer, offset)
      if (!res) break; offset += res.bytesRead; value = buffer.slice(offset, offset + res.value); offset += res.value
    } else if (wireType === 5) {
      value = buffer[offset] | (buffer[offset+1] << 8) | (buffer[offset+2] << 16) | (buffer[offset+3] << 24); offset += 4
    } else break
    fields[fieldNumber] = value
  }
  return fields
}

// ============================================
// BLE Session Manager
// ============================================

class BLECryptoBrain {
  constructor() { this.reset() }
  reset() {
    this.ephemeralPrivateKey = null; this.ephemeralPublicKey = null; this.vehiclePublicKey = null
    this.sessionKey = null; this.epoch = null; this.counter = 0; this.clockTime = 0
    this.routingAddress = null; this.established = false
  }

  buildPairMessage(publicKeyHex) {
    const whitelistOp = buildWhitelistOperation(hexToBytes(publicKeyHex))
    const unsignedMessage = buildUnsignedMessage({ whitelistOp })
    const signedMsg = buildSignedMessage({ payload: unsignedMessage, signatureType: constants.SIGNATURE_TYPE_PRESENT_KEY })
    const message = buildToVCSECMessage(signedMsg)
    return { success: true, messageHex: bytesToHex(message) }
  }

  // Derive session key: K = SHA1(ECDH_x)[:16]
  processSessionInfoResponse(responseHex) {
    try {
      const response = hexToBytes(responseHex)
      const routable = decodeMessage(response)
      const sessionInfoBytes = routable[15]
      if (!sessionInfoBytes) return { success: false, error: 'No session info' }
      const session = decodeMessage(sessionInfoBytes)
      this.vehiclePublicKey = session[1]
      this.epoch = session[2]
      this.clockTime = session[3] || Math.floor(Date.now() / 1000)
      this.counter = session[4] || 0
      const sharedSecret = ecdh(this.ephemeralPrivateKey, this.vehiclePublicKey)
      const keyMaterial = sha1(sharedSecret)
      this.sessionKey = keyMaterial.slice(0, 16)
      this.established = true
      return { success: true, established: true, counter: this.counter, clockTime: this.clockTime, epochHex: bytesToHex(this.epoch) }
    } catch (e) { return { success: false, error: e.message } }
  }

  parsePairingResponse(responseHex) {
    try {
      const data = hexToBytes(responseHex)
      const outer = decodeMessage(data)
      let fields = outer; if (outer[10]) fields = decodeMessage(outer[10])
      
      // Check CommandStatus (Field 4 of FromVCSECMessage)
      if (fields[4]) {
        const cs = decodeMessage(fields[4])
        const opStatus = cs[1]
        if (opStatus === constants.OPERATIONSTATUS_WAIT) return { status: 'wait', message: 'Tap key card' }
        if (opStatus === constants.OPERATIONSTATUS_OK) return { status: 'ok', message: 'Key added' }
        if (opStatus === constants.OPERATIONSTATUS_ERROR) return { status: 'error', error: 'Op failed' }
      }
      
      // Check WhitelistOperationStatus (Field 6 of FromVCSECMessage)
      if (fields[6]) {
        const ws = decodeMessage(fields[6])
        const wlInfo = ws[1]
        if (wlInfo === 0) return { status: 'ok', message: 'Key added' }
        if (wlInfo === 14) return { status: 'wait', message: 'Tap key card' }
        return { status: 'error', error: 'WL error ' + wlInfo }
      }

      return { status: 'pending' }
    } catch (e) { return { status: 'error', error: e.message } }
  }
}

const bleCryptoBrain = new BLECryptoBrain()
export default bleCryptoBrain
export { hexToBytes, bytesToHex, generatePrivateKey, getPublicKey }
