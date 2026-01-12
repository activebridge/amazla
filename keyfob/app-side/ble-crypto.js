// Tesla BLE Crypto Handler for App-Side
// Handles crypto operations for watch BLE communication
// The phone has more memory so we can do P-256 crypto here

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

function encodeVarintField(fieldNumber, value) {
  return encodeEnum(fieldNumber, value)
}

function concat(...arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

// ============================================
// Crypto helpers
// ============================================

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function randomBytes(length) {
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256)
  }
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

  padded.set(bytes)
  padded[msgLen] = 0x80

  const lenView = new DataView(padded.buffer, paddedLen - 8)
  lenView.setUint32(4, bitLen, false)

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19

  for (let i = 0; i < paddedLen; i += 64) {
    const w = new Array(64)
    const chunk = new DataView(padded.buffer, i, 64)

    for (let j = 0; j < 16; j++) {
      w[j] = chunk.getUint32(j * 4, false)
    }

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

  const result = new Uint8Array(32)
  const view = new DataView(result.buffer)
  view.setUint32(0, h0, false); view.setUint32(4, h1, false)
  view.setUint32(8, h2, false); view.setUint32(12, h3, false)
  view.setUint32(16, h4, false); view.setUint32(20, h5, false)
  view.setUint32(24, h6, false); view.setUint32(28, h7, false)

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

  padded.set(bytes)
  padded[msgLen] = 0x80

  const lenView = new DataView(padded.buffer, paddedLen - 8)
  lenView.setUint32(4, bitLen, false)

  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0

  for (let i = 0; i < paddedLen; i += 64) {
    const w = new Array(80)
    const chunk = new DataView(padded.buffer, i, 64)

    for (let j = 0; j < 16; j++) {
      w[j] = chunk.getUint32(j * 4, false)
    }

    for (let j = 16; j < 80; j++) {
      w[j] = leftrotate(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1)
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4

    for (let j = 0; j < 80; j++) {
      let f, k
      if (j < 20) {
        f = (b & c) | ((~b) & d)
        k = 0x5A827999
      } else if (j < 40) {
        f = b ^ c ^ d
        k = 0x6ED9EBA1
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8F1BBCDC
      } else {
        f = b ^ c ^ d
        k = 0xCA62C1D6
      }

      const temp = (leftrotate(a, 5) + f + e + k + w[j]) >>> 0
      e = d; d = c; c = leftrotate(b, 30); b = a; a = temp
    }

    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0
  }

  const result = new Uint8Array(20)
  const view = new DataView(result.buffer)
  view.setUint32(0, h0, false); view.setUint32(4, h1, false)
  view.setUint32(8, h2, false); view.setUint32(12, h3, false)
  view.setUint32(16, h4, false)

  return result
}

// HMAC-SHA256
function hmacSha256(key, data) {
  const keyBytes = typeof key === 'string' ? new TextEncoder().encode(key) : key
  const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data

  let actualKey = keyBytes
  if (actualKey.length > 64) {
    actualKey = sha256(actualKey)
  }
  if (actualKey.length < 64) {
    const padded = new Uint8Array(64)
    padded.set(actualKey)
    actualKey = padded
  }

  const oKeyPad = new Uint8Array(64)
  const iKeyPad = new Uint8Array(64)

  for (let i = 0; i < 64; i++) {
    oKeyPad[i] = actualKey[i] ^ 0x5c
    iKeyPad[i] = actualKey[i] ^ 0x36
  }

  const inner = new Uint8Array(64 + dataBytes.length)
  inner.set(iKeyPad)
  inner.set(dataBytes, 64)

  const innerHash = sha256(inner)

  const outer = new Uint8Array(64 + 32)
  outer.set(oKeyPad)
  outer.set(innerHash, 64)

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

function mod(a, m) {
  return ((a % m) + m) % m
}

function modInverse(a, m) {
  if (a < 0n) a = mod(a, m)
  let [old_r, r] = [a, m]
  let [old_s, s] = [1n, 0n]
  while (r !== 0n) {
    const quotient = old_r / r
    ;[old_r, r] = [r, old_r - quotient * r]
    ;[old_s, s] = [s, old_s - quotient * s]
  }
  if (old_r > 1n) throw new Error('Modular inverse does not exist')
  if (old_s < 0n) old_s += m
  return old_s
}

function pointAdd([x1, y1], [x2, y2]) {
  if (x1 === 0n && y1 === 0n) return [x2, y2]
  if (x2 === 0n && y2 === 0n) return [x1, y1]
  if (x1 === x2) {
    if (y1 === y2) return pointDouble([x1, y1])
    return [0n, 0n]
  }
  const lambda = mod((y2 - y1) * modInverse(x2 - x1, P256_P), P256_P)
  const x3 = mod(lambda * lambda - x1 - x2, P256_P)
  const y3 = mod(lambda * (x1 - x3) - y1, P256_P)
  return [x3, y3]
}

function pointDouble([x, y]) {
  if (x === 0n && y === 0n) return [0n, 0n]
  const lambda = mod((3n * x * x + P256_A) * modInverse(2n * y, P256_P), P256_P)
  const x3 = mod(lambda * lambda - 2n * x, P256_P)
  const y3 = mod(lambda * (x - x3) - y, P256_P)
  return [x3, y3]
}

function pointMultiply(scalar, point) {
  if (scalar === 0n) return [0n, 0n]
  let result = [0n, 0n]
  let addend = [...point]
  while (scalar > 0n) {
    if (scalar & 1n) result = pointAdd(result, addend)
    addend = pointDouble(addend)
    scalar >>= 1n
  }
  return result
}

function bigIntToBytes(bigint, length = 32) {
  const hex = bigint.toString(16).padStart(length * 2, '0')
  return hexToBytes(hex)
}

function bytesToBigInt(bytes) {
  return BigInt('0x' + bytesToHex(bytes))
}

function generatePrivateKey() {
  const bytes = randomBytes(32)
  let k = bytesToBigInt(bytes)
  k = k % P256_N
  if (k === 0n) k = 1n
  return bigIntToBytes(k)
}

function getPublicKey(privateKeyBytes) {
  const k = bytesToBigInt(privateKeyBytes)
  const [x, y] = pointMultiply(k, [P256_GX, P256_GY])
  const result = new Uint8Array(65)
  result[0] = 0x04
  result.set(bigIntToBytes(x), 1)
  result.set(bigIntToBytes(y), 33)
  return result
}

function ecdh(privateKeyBytes, publicKeyBytes) {
  const k = bytesToBigInt(privateKeyBytes)
  let pubX, pubY
  if (publicKeyBytes[0] === 0x04 && publicKeyBytes.length === 65) {
    pubX = bytesToBigInt(publicKeyBytes.slice(1, 33))
    pubY = bytesToBigInt(publicKeyBytes.slice(33, 65))
  } else if (publicKeyBytes.length === 64) {
    pubX = bytesToBigInt(publicKeyBytes.slice(0, 32))
    pubY = bytesToBigInt(publicKeyBytes.slice(32, 64))
  } else {
    throw new Error('Invalid public key')
  }
  const [x, _] = pointMultiply(k, [pubX, pubY])
  return bigIntToBytes(x)
}

// ============================================
// Tesla VCSEC Protocol Constants
// ============================================

const DOMAIN_VEHICLE_SECURITY = 2
const SIGNATURE_TYPE_HMAC = 5

// RKE Actions from vcsec.proto RKEAction_E enum
const RKE_ACTION_UNLOCK = 0
const RKE_ACTION_LOCK = 1
const RKE_ACTION_OPEN_TRUNK = 2
const RKE_ACTION_OPEN_FRUNK = 3

// ============================================
// Tesla VCSEC Message Builders
// ============================================

function buildRoutableMessage(options) {
  // RoutableMessage field numbers from universal_message.proto:
  // 6: to_destination (Destination)
  // 7: from_destination (Destination)
  // 10: protobuf_message_as_bytes (payload)
  // 14: session_info_request
  // 50: request_uuid
  // 51: uuid
  const parts = []
  if (options.toDomain !== undefined) {
    // Destination { domain (field 1) = value }
    const destination = encodeEnum(1, options.toDomain)
    parts.push(encodeBytes(6, destination))  // to_destination is field 6
  }
  if (options.routingAddress) {
    // Destination { routing_address (field 2) = bytes }
    const destination = encodeBytes(2, options.routingAddress)
    parts.push(encodeBytes(7, destination))  // from_destination is field 7
  }
  if (options.payload) {
    parts.push(encodeBytes(10, options.payload))  // protobuf_message_as_bytes is field 10
  }
  if (options.sessionInfoRequest) {
    parts.push(encodeBytes(14, options.sessionInfoRequest))  // session_info_request is field 14
  }
  if (options.uuid) {
    parts.push(encodeBytes(50, options.uuid))  // request_uuid is field 50
  }
  return concat(...parts)
}

function buildSessionInfoRequest(publicKey, challenge) {
  const parts = []
  if (publicKey) parts.push(encodeBytes(1, publicKey))
  if (challenge) parts.push(encodeBytes(2, challenge))
  return concat(...parts)
}

function buildPublicKey(publicKeyBytes) {
  // PublicKey { PublicKeyRaw (field 1) = bytes }
  return encodeBytes(1, publicKeyBytes)
}

// Key form factors from vcsec.proto
const KEY_FORM_FACTOR_ANDROID_DEVICE = 7

function buildKeyMetadata(keyFormFactor) {
  // KeyMetadata { keyFormFactor (field 1) = enum }
  return encodeEnum(1, keyFormFactor)
}

function buildWhitelistOperation(publicKey, keyFormFactor = KEY_FORM_FACTOR_ANDROID_DEVICE) {
  // WhitelistOperation {
  //   addPublicKeyToWhitelist (field 1) = PublicKey
  //   metadataForKey (field 16) = KeyMetadata
  // }
  const parts = []
  parts.push(encodeBytes(1, publicKey))

  // Add metadata with key form factor - required for Tesla to process pairing
  const metadata = buildKeyMetadata(keyFormFactor)
  parts.push(encodeBytes(16, metadata))

  return concat(...parts)
}

function buildUnsignedMessageWithWhitelist(whitelistOp) {
  return encodeBytes(16, whitelistOp)
}

function buildUnsignedMessage(options) {
  // UnsignedMessage field numbers from vcsec.proto:
  // 1: InformationRequest
  // 2: RKEAction
  // 4: closureMoveRequest
  // 16: WhitelistOperation
  const parts = []
  if (options.rkeAction !== undefined) {
    parts.push(encodeEnum(2, options.rkeAction))  // RKEAction is field 2
  }
  return concat(...parts)
}

function buildSignedMessage(options) {
  const parts = []
  if (options.payload) parts.push(encodeBytes(1, options.payload))
  if (options.signatureType !== undefined) parts.push(encodeEnum(2, options.signatureType))
  if (options.signature) parts.push(encodeBytes(5, options.signature))
  if (options.counter !== undefined) parts.push(encodeVarintField(8, options.counter))
  if (options.epoch) parts.push(encodeBytes(9, options.epoch))
  if (options.expiresAt !== undefined) parts.push(encodeVarintField(10, options.expiresAt))
  return concat(...parts)
}

function buildToVCSECMessage(signedMessage) {
  return encodeBytes(1, signedMessage)
}

// ============================================
// BLE Session Manager
// ============================================

class BLECryptoSession {
  constructor() {
    this.reset()
  }

  reset() {
    this.ephemeralPrivateKey = null
    this.ephemeralPublicKey = null
    this.vehiclePublicKey = null
    this.sessionKey = null
    this.epoch = null
    this.counter = 0
    this.clockTime = 0
    this.routingAddress = null
    this.established = false
  }

  // Build session info request message
  buildSessionInfoRequestMessage(enrolledPublicKeyHex) {
    // Generate ephemeral keypair
    this.ephemeralPrivateKey = generatePrivateKey()
    this.ephemeralPublicKey = getPublicKey(this.ephemeralPrivateKey)

    // Generate routing address
    this.routingAddress = randomBytes(16)

    // Build request
    const sessionInfoRequest = buildSessionInfoRequest(
      this.ephemeralPublicKey,
      randomBytes(16) // challenge
    )

    const message = buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      routingAddress: this.routingAddress,
      sessionInfoRequest: sessionInfoRequest,
      uuid: randomBytes(16)
    })

    // Note: teslaBLE.send() adds the 2-byte length prefix
    return {
      success: true,
      messageHex: bytesToHex(message),
      ephemeralPublicKeyHex: bytesToHex(this.ephemeralPublicKey),
      routingAddressHex: bytesToHex(this.routingAddress)
    }
  }

  // Process session info response from vehicle
  processSessionInfoResponse(responseHex) {
    try {
      const response = hexToBytes(responseHex)

      // Parse RoutableMessage to get session_info (field 15)
      const routableFields = this._decodeMessage(response)
      console.log('[Session] Routable fields:', Object.keys(routableFields))

      // Session info is in field 15
      const sessionInfoBytes = routableFields[15]
      if (!sessionInfoBytes) {
        return { success: false, error: 'No session info in response' }
      }

      // Parse SessionInfo message
      // Fields: 1=publicKey, 2=epoch, 3=clockTime, 4=counter
      const sessionFields = this._decodeMessage(sessionInfoBytes)
      console.log('[Session] Session fields:', Object.keys(sessionFields))

      // Extract vehicle public key (field 1)
      this.vehiclePublicKey = sessionFields[1]
      if (!this.vehiclePublicKey || this.vehiclePublicKey.length !== 65) {
        return { success: false, error: 'Invalid vehicle public key' }
      }

      // Extract epoch (field 2) - 16 bytes
      this.epoch = sessionFields[2]
      if (!this.epoch) {
        return { success: false, error: 'No epoch in session info' }
      }

      // Extract clock time (field 3) - uint32
      this.clockTime = sessionFields[3] || Math.floor(Date.now() / 1000)

      // Extract counter (field 4) - uint32
      this.counter = sessionFields[4] || 0

      console.log('[Session] Vehicle public key length:', this.vehiclePublicKey.length)
      console.log('[Session] Epoch length:', this.epoch.length)
      console.log('[Session] Clock time:', this.clockTime)
      console.log('[Session] Counter:', this.counter)

      // Derive session key: K = SHA1(ECDH_x)[:16]
      const sharedSecret = ecdh(this.ephemeralPrivateKey, this.vehiclePublicKey)
      const keyMaterial = sha1(sharedSecret)
      this.sessionKey = keyMaterial.slice(0, 16)

      this.established = true

      console.log('[Session] Session established successfully')

      return {
        success: true,
        established: true,
        counter: this.counter,
        clockTime: this.clockTime,
        epochHex: bytesToHex(this.epoch)
      }
    } catch (e) {
      console.log('[Session] Error processing response:', e.message)
      return { success: false, error: e.message }
    }
  }

  // Simple protobuf decoder for session parsing
  _decodeMessage(data) {
    const fields = {}
    let offset = 0

    while (offset < data.length) {
      // Decode field key (varint)
      let fieldKey = 0
      let shift = 0
      while (offset < data.length) {
        const byte = data[offset++]
        fieldKey |= (byte & 0x7f) << shift
        if ((byte & 0x80) === 0) break
        shift += 7
      }

      const fieldNumber = fieldKey >> 3
      const wireType = fieldKey & 0x07

      if (wireType === 0) {
        // Varint
        let value = 0
        shift = 0
        while (offset < data.length) {
          const byte = data[offset++]
          value |= (byte & 0x7f) << shift
          if ((byte & 0x80) === 0) break
          shift += 7
        }
        fields[fieldNumber] = value
      } else if (wireType === 2) {
        // Length-delimited
        let length = 0
        shift = 0
        while (offset < data.length) {
          const byte = data[offset++]
          length |= (byte & 0x7f) << shift
          if ((byte & 0x80) === 0) break
          shift += 7
        }
        fields[fieldNumber] = data.slice(offset, offset + length)
        offset += length
      } else if (wireType === 5) {
        // 32-bit fixed
        fields[fieldNumber] = data[offset] | (data[offset + 1] << 8) |
                              (data[offset + 2] << 16) | (data[offset + 3] << 24)
        offset += 4
      } else {
        // Unknown wire type, skip
        break
      }
    }

    return fields
  }

  // Build pairing message (add key to whitelist)
  buildPairMessage(publicKeyHex) {
    const publicKeyBytes = hexToBytes(publicKeyHex)

    // Generate routing address for response routing
    this.routingAddress = randomBytes(16)

    // Build PublicKey message: { PublicKeyRaw (field 1) = bytes }
    const publicKey = buildPublicKey(publicKeyBytes)

    // Build WhitelistOperation: { addPublicKeyToWhitelist (field 1) = PublicKey }
    const whitelistOp = buildWhitelistOperation(publicKey)

    // Build unsigned message with whitelist
    const unsignedMessage = buildUnsignedMessageWithWhitelist(whitelistOp)

    // Build routable message (pairing doesn't need session/signing)
    const message = buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      routingAddress: this.routingAddress,
      payload: unsignedMessage,
      uuid: randomBytes(16)
    })

    // Note: teslaBLE.send() adds the 2-byte length prefix
    return {
      success: true,
      messageHex: bytesToHex(message)
    }
  }

  // Build authenticated command message
  buildCommandMessage(rkeAction) {
    if (!this.established) {
      return { success: false, error: 'Session not established' }
    }

    this.counter++

    // Build unsigned RKE message
    const unsignedMessage = buildUnsignedMessage({ rkeAction })

    // Build signed message metadata
    const expiresAt = this.clockTime + 60

    // Build signed message without signature first
    const signedMessageForHmac = buildSignedMessage({
      payload: unsignedMessage,
      signatureType: SIGNATURE_TYPE_HMAC,
      counter: this.counter,
      epoch: this.epoch,
      expiresAt: expiresAt
    })

    // Calculate HMAC
    const hmac = hmacSha256(this.sessionKey, signedMessageForHmac)

    // Build signed message with signature
    const signedMessage = buildSignedMessage({
      payload: unsignedMessage,
      signatureType: SIGNATURE_TYPE_HMAC,
      signature: hmac,
      counter: this.counter,
      epoch: this.epoch,
      expiresAt: expiresAt
    })

    // Wrap in ToVCSECMessage
    const toVcsec = buildToVCSECMessage(signedMessage)

    // Build routable message
    const message = buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      routingAddress: this.routingAddress,
      payload: toVcsec,
      uuid: randomBytes(16)
    })

    // Note: teslaBLE.send() adds the 2-byte length prefix
    return {
      success: true,
      messageHex: bytesToHex(message),
      counter: this.counter
    }
  }

  buildLockMessage() {
    return this.buildCommandMessage(RKE_ACTION_LOCK)
  }

  buildUnlockMessage() {
    return this.buildCommandMessage(RKE_ACTION_UNLOCK)
  }

  buildTrunkMessage() {
    return this.buildCommandMessage(RKE_ACTION_OPEN_TRUNK)
  }

  buildFrunkMessage() {
    return this.buildCommandMessage(RKE_ACTION_OPEN_FRUNK)
  }
}

// Singleton
const bleCryptoSession = new BLECryptoSession()

export default bleCryptoSession
export {
  hexToBytes,
  bytesToHex,
  generatePrivateKey,
  getPublicKey
}
