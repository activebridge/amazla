// Base32 decoder
function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  str = str.toUpperCase().replace(/=+$/, '')

  let bits = 0
  let value = 0
  const output = []

  for (let i = 0; i < str.length; i++) {
    const idx = alphabet.indexOf(str[i])
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }

  return output
}

// HMAC-SHA1 implementation
function hmacSha1(key, message) {
  const blockSize = 64

  // Pad or hash key
  if (key.length > blockSize) {
    key = sha1(key)
  }
  while (key.length < blockSize) {
    key.push(0)
  }

  const oKeyPad = key.map(b => b ^ 0x5c)
  const iKeyPad = key.map(b => b ^ 0x36)

  const inner = sha1([...iKeyPad, ...message])
  return sha1([...oKeyPad, ...inner])
}

// SHA1 implementation
function sha1(message) {
  const ml = message.length * 8

  // Pre-processing
  message = [...message, 0x80]
  while ((message.length % 64) !== 56) {
    message.push(0)
  }

  // Append length
  for (let i = 56; i >= 0; i -= 8) {
    message.push((ml >>> i) & 0xff)
  }

  // Initialize hash values
  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  // Process chunks
  for (let i = 0; i < message.length; i += 64) {
    const w = []
    for (let j = 0; j < 16; j++) {
      w[j] = (message[i + j * 4] << 24) |
             (message[i + j * 4 + 1] << 16) |
             (message[i + j * 4 + 2] << 8) |
             message[i + j * 4 + 3]
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

  return [
    (h0 >>> 24) & 0xff, (h0 >>> 16) & 0xff, (h0 >>> 8) & 0xff, h0 & 0xff,
    (h1 >>> 24) & 0xff, (h1 >>> 16) & 0xff, (h1 >>> 8) & 0xff, h1 & 0xff,
    (h2 >>> 24) & 0xff, (h2 >>> 16) & 0xff, (h2 >>> 8) & 0xff, h2 & 0xff,
    (h3 >>> 24) & 0xff, (h3 >>> 16) & 0xff, (h3 >>> 8) & 0xff, h3 & 0xff,
    (h4 >>> 24) & 0xff, (h4 >>> 16) & 0xff, (h4 >>> 8) & 0xff, h4 & 0xff,
  ]
}

/**
 * Generate TOTP code
 * @param {string} secret - Base32 encoded secret
 * @param {number} digits - Number of digits (default 6)
 * @param {number} period - Time period in seconds (default 30)
 * @returns {string} - TOTP code
 */
export function generateTOTP(secret, digits = 6, period = 30) {
  const key = base32Decode(secret)
  const time = Math.floor(Date.now() / 1000 / period)

  // Convert time to 8-byte array (big-endian)
  const timeBytes = []
  let t = time
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

  const otp = code % Math.pow(10, digits)
  return otp.toString().padStart(digits, '0')
}

/**
 * Get remaining seconds in current period
 * @param {number} period - Time period in seconds (default 30)
 * @returns {number} - Seconds remaining
 */
export function getTimeRemaining(period = 30) {
  return period - (Math.floor(Date.now() / 1000) % period)
}

/**
 * Format TOTP code with space in middle (e.g., "123 456")
 * @param {string} code - TOTP code
 * @returns {string} - Formatted code
 */
export function formatCode(code) {
  const mid = Math.floor(code.length / 2)
  return code.slice(0, mid) + ' ' + code.slice(mid)
}

/**
 * Get formatted TOTP code for an account
 * @param {object} acc - Account object with secret and optional digits
 * @returns {string} - Formatted TOTP code
 */
export const getCode = (acc) => formatCode(generateTOTP(acc.secret, acc.digits || 6))
