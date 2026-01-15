// Optimized TOTP implementation for low-power devices

// Pre-allocated buffers for SHA1
const w = new Uint32Array(80)
const msgBuffer = new Uint8Array(128)

// Cache for decoded keys (secret -> Uint8Array)
const keyCache = new Map()

// Cache for TOTP codes (secret -> { code, period })
const codeCache = new Map()

// Base32 decoder with caching
function base32Decode(str) {
  if (keyCache.has(str)) return keyCache.get(str)

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const input = str.toUpperCase().replace(/=+$/, '')

  let bits = 0
  let value = 0
  const output = []

  for (let i = 0; i < input.length; i++) {
    const idx = alphabet.indexOf(input[i])
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }

  const result = new Uint8Array(output)
  keyCache.set(str, result)
  return result
}

// Optimized SHA1 with pre-allocated buffers
function sha1(message, msgLen) {
  const ml = msgLen * 8

  // Copy message to buffer and pad
  let len = msgLen
  msgBuffer[len++] = 0x80
  while ((len % 64) !== 56) {
    msgBuffer[len++] = 0
  }

  // Append length (big-endian 64-bit)
  for (let i = 7; i >= 0; i--) {
    msgBuffer[len++] = (i < 4) ? ((ml >>> (i * 8)) & 0xff) : 0
  }

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  for (let i = 0; i < len; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] = (msgBuffer[i + j * 4] << 24) |
             (msgBuffer[i + j * 4 + 1] << 16) |
             (msgBuffer[i + j * 4 + 2] << 8) |
             msgBuffer[i + j * 4 + 3]
    }

    for (let j = 16; j < 80; j++) {
      const n = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16]
      w[j] = (n << 1) | (n >>> 31)
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4

    for (let j = 0; j < 80; j++) {
      let f, k
      if (j < 20) {
        f = (b & c) | ((~b) & d)
        k = 0x5a827999
      } else if (j < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }

      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) >>> 0
      e = d
      d = c
      c = ((b << 30) | (b >>> 2)) >>> 0
      b = a
      a = temp
    }

    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }

  return new Uint8Array([
    (h0 >>> 24) & 0xff, (h0 >>> 16) & 0xff, (h0 >>> 8) & 0xff, h0 & 0xff,
    (h1 >>> 24) & 0xff, (h1 >>> 16) & 0xff, (h1 >>> 8) & 0xff, h1 & 0xff,
    (h2 >>> 24) & 0xff, (h2 >>> 16) & 0xff, (h2 >>> 8) & 0xff, h2 & 0xff,
    (h3 >>> 24) & 0xff, (h3 >>> 16) & 0xff, (h3 >>> 8) & 0xff, h3 & 0xff,
    (h4 >>> 24) & 0xff, (h4 >>> 16) & 0xff, (h4 >>> 8) & 0xff, h4 & 0xff,
  ])
}

// Optimized HMAC-SHA1
function hmacSha1(key, message) {
  const blockSize = 64
  const keyLen = key.length

  // Prepare key (pad to blockSize)
  let k = key
  if (keyLen > blockSize) {
    for (let i = 0; i < keyLen; i++) msgBuffer[i] = key[i]
    k = sha1(msgBuffer, keyLen)
  }

  // Inner hash: SHA1(iKeyPad || message)
  let pos = 0
  for (let i = 0; i < blockSize; i++) {
    msgBuffer[pos++] = (i < k.length ? k[i] : 0) ^ 0x36
  }
  for (let i = 0; i < message.length; i++) {
    msgBuffer[pos++] = message[i]
  }
  const inner = sha1(msgBuffer, pos)

  // Outer hash: SHA1(oKeyPad || inner)
  pos = 0
  for (let i = 0; i < blockSize; i++) {
    msgBuffer[pos++] = (i < k.length ? k[i] : 0) ^ 0x5c
  }
  for (let i = 0; i < 20; i++) {
    msgBuffer[pos++] = inner[i]
  }

  return sha1(msgBuffer, pos)
}

/**
 * Generate TOTP code with caching
 */
export function generateTOTP(secret, digits = 6, period = 30) {
  const currentPeriod = Math.floor(Date.now() / 1000 / period)

  // Check cache
  const cached = codeCache.get(secret)
  if (cached && cached.period === currentPeriod) {
    return cached.code
  }

  const key = base32Decode(secret)

  // Convert time to 8-byte array (big-endian)
  const timeBytes = new Uint8Array(8)
  let t = currentPeriod
  for (let i = 7; i >= 0; i--) {
    timeBytes[i] = t & 0xff
    t = Math.floor(t / 256)
  }

  const hash = hmacSha1(key, timeBytes)

  // Dynamic truncation
  const offset = hash[19] & 0x0f
  const code = ((hash[offset] & 0x7f) << 24) |
               ((hash[offset + 1] & 0xff) << 16) |
               ((hash[offset + 2] & 0xff) << 8) |
               (hash[offset + 3] & 0xff)

  const otp = (code % Math.pow(10, digits)).toString().padStart(digits, '0')

  // Cache result
  codeCache.set(secret, { code: otp, period: currentPeriod })

  return otp
}

/**
 * Get remaining seconds in current period
 */
export function getTimeRemaining(period = 30) {
  return period - (Math.floor(Date.now() / 1000) % period)
}

/**
 * Format TOTP code with space in middle
 */
export function formatCode(code) {
  const mid = Math.floor(code.length / 2)
  return code.slice(0, mid) + ' ' + code.slice(mid)
}
