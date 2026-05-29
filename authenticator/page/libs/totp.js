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

// SHA-256 implementation
const K256 = [
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]

function sha256(message) {
  const ml = message.length * 8
  message = [...message, 0x80]
  while ((message.length % 64) !== 56) message.push(0)
  message.push(0, 0, 0, 0, (ml >>> 24) & 0xff, (ml >>> 16) & 0xff, (ml >>> 8) & 0xff, ml & 0xff)

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19
  const ww = new Array(64)
  const rotr = (x, n) => (x >>> n) | (x << (32 - n))

  for (let i = 0; i < message.length; i += 64) {
    for (let j = 0; j < 16; j++) {
      ww[j] = (message[i + j * 4] << 24) | (message[i + j * 4 + 1] << 16) |
              (message[i + j * 4 + 2] << 8) | message[i + j * 4 + 3]
    }
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(ww[j - 15], 7) ^ rotr(ww[j - 15], 18) ^ (ww[j - 15] >>> 3)
      const s1 = rotr(ww[j - 2], 17) ^ rotr(ww[j - 2], 19) ^ (ww[j - 2] >>> 10)
      ww[j] = (ww[j - 16] + s0 + ww[j - 7] + s1) >>> 0
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ ((~e) & g)
      const t1 = (h + S1 + ch + K256[j] + ww[j]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0
  }
  const out = []
  const hs = [h0, h1, h2, h3, h4, h5, h6, h7]
  for (let i = 0; i < hs.length; i++) {
    out.push((hs[i] >>> 24) & 0xff, (hs[i] >>> 16) & 0xff, (hs[i] >>> 8) & 0xff, hs[i] & 0xff)
  }
  return out
}

// SHA-512 implementation (64-bit words as [hi, lo] 32-bit pairs)
const K512 = [
  [0x428a2f98,0xd728ae22],[0x71374491,0x23ef65cd],[0xb5c0fbcf,0xec4d3b2f],[0xe9b5dba5,0x8189dbbc],
  [0x3956c25b,0xf348b538],[0x59f111f1,0xb605d019],[0x923f82a4,0xaf194f9b],[0xab1c5ed5,0xda6d8118],
  [0xd807aa98,0xa3030242],[0x12835b01,0x45706fbe],[0x243185be,0x4ee4b28c],[0x550c7dc3,0xd5ffb4e2],
  [0x72be5d74,0xf27b896f],[0x80deb1fe,0x3b1696b1],[0x9bdc06a7,0x25c71235],[0xc19bf174,0xcf692694],
  [0xe49b69c1,0x9ef14ad2],[0xefbe4786,0x384f25e3],[0x0fc19dc6,0x8b8cd5b5],[0x240ca1cc,0x77ac9c65],
  [0x2de92c6f,0x592b0275],[0x4a7484aa,0x6ea6e483],[0x5cb0a9dc,0xbd41fbd4],[0x76f988da,0x831153b5],
  [0x983e5152,0xee66dfab],[0xa831c66d,0x2db43210],[0xb00327c8,0x98fb213f],[0xbf597fc7,0xbeef0ee4],
  [0xc6e00bf3,0x3da88fc2],[0xd5a79147,0x930aa725],[0x06ca6351,0xe003826f],[0x14292967,0x0a0e6e70],
  [0x27b70a85,0x46d22ffc],[0x2e1b2138,0x5c26c926],[0x4d2c6dfc,0x5ac42aed],[0x53380d13,0x9d95b3df],
  [0x650a7354,0x8baf63de],[0x766a0abb,0x3c77b2a8],[0x81c2c92e,0x47edaee6],[0x92722c85,0x1482353b],
  [0xa2bfe8a1,0x4cf10364],[0xa81a664b,0xbc423001],[0xc24b8b70,0xd0f89791],[0xc76c51a3,0x0654be30],
  [0xd192e819,0xd6ef5218],[0xd6990624,0x5565a910],[0xf40e3585,0x5771202a],[0x106aa070,0x32bbd1b8],
  [0x19a4c116,0xb8d2d0c8],[0x1e376c08,0x5141ab53],[0x2748774c,0xdf8eeb99],[0x34b0bcb5,0xe19b48a8],
  [0x391c0cb3,0xc5c95a63],[0x4ed8aa4a,0xe3418acb],[0x5b9cca4f,0x7763e373],[0x682e6ff3,0xd6b2b8a3],
  [0x748f82ee,0x5defb2fc],[0x78a5636f,0x43172f60],[0x84c87814,0xa1f0ab72],[0x8cc70208,0x1a6439ec],
  [0x90befffa,0x23631e28],[0xa4506ceb,0xde82bde9],[0xbef9a3f7,0xb2c67915],[0xc67178f2,0xe372532b],
  [0xca273ece,0xea26619c],[0xd186b8c7,0x21c0c207],[0xeada7dd6,0xcde0eb1e],[0xf57d4f7f,0xee6ed178],
  [0x06f067aa,0x72176fba],[0x0a637dc5,0xa2c898a6],[0x113f9804,0xbef90dae],[0x1b710b35,0x131c471b],
  [0x28db77f5,0x23047d84],[0x32caab7b,0x40c72493],[0x3c9ebe0a,0x15c9bebc],[0x431d67c4,0x9c100d4c],
  [0x4cc5d4be,0xcb3e42b6],[0x597f299c,0xfc657e2a],[0x5fcb6fab,0x3ad6faec],[0x6c44198c,0x4a475817],
]

function sha512(message) {
  const add = (...xs) => {
    let lo = 0, hi = 0
    for (let i = 0; i < xs.length; i++) { lo += xs[i][1] >>> 0; hi += xs[i][0] >>> 0 }
    hi = (hi + Math.floor(lo / 0x100000000)) >>> 0
    return [hi, lo >>> 0]
  }
  const xor = (a, b) => [(a[0] ^ b[0]) >>> 0, (a[1] ^ b[1]) >>> 0]
  const and = (a, b) => [(a[0] & b[0]) >>> 0, (a[1] & b[1]) >>> 0]
  const not = (a) => [(~a[0]) >>> 0, (~a[1]) >>> 0]
  const shr = (x, n) => {
    if (n === 0) return [x[0], x[1]]
    if (n < 32) return [x[0] >>> n, ((x[1] >>> n) | (x[0] << (32 - n))) >>> 0]
    return [0, (x[0] >>> (n - 32)) >>> 0]
  }
  const rotr = (x, n) => {
    n %= 64
    if (n === 0) return [x[0], x[1]]
    if (n < 32) return [((x[0] >>> n) | (x[1] << (32 - n))) >>> 0, ((x[1] >>> n) | (x[0] << (32 - n))) >>> 0]
    if (n === 32) return [x[1], x[0]]
    n -= 32
    return [((x[1] >>> n) | (x[0] << (32 - n))) >>> 0, ((x[0] >>> n) | (x[1] << (32 - n))) >>> 0]
  }

  const ml = message.length * 8
  message = [...message, 0x80]
  while ((message.length % 128) !== 112) message.push(0)
  for (let i = 0; i < 12; i++) message.push(0)
  message.push((ml >>> 24) & 0xff, (ml >>> 16) & 0xff, (ml >>> 8) & 0xff, ml & 0xff)

  let h = [
    [0x6a09e667,0xf3bcc908],[0xbb67ae85,0x84caa73b],[0x3c6ef372,0xfe94f82b],[0xa54ff53a,0x5f1d36f1],
    [0x510e527f,0xade682d1],[0x9b05688c,0x2b3e6c1f],[0x1f83d9ab,0xfb41bd6b],[0x5be0cd19,0x137e2179],
  ]
  const ww = new Array(80)

  for (let i = 0; i < message.length; i += 128) {
    for (let j = 0; j < 16; j++) {
      const o = i + j * 8
      ww[j] = [
        ((message[o] << 24) | (message[o + 1] << 16) | (message[o + 2] << 8) | message[o + 3]) >>> 0,
        ((message[o + 4] << 24) | (message[o + 5] << 16) | (message[o + 6] << 8) | message[o + 7]) >>> 0,
      ]
    }
    for (let j = 16; j < 80; j++) {
      const s0 = xor(xor(rotr(ww[j - 15], 1), rotr(ww[j - 15], 8)), shr(ww[j - 15], 7))
      const s1 = xor(xor(rotr(ww[j - 2], 19), rotr(ww[j - 2], 61)), shr(ww[j - 2], 6))
      ww[j] = add(ww[j - 16], s0, ww[j - 7], s1)
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7]
    for (let j = 0; j < 80; j++) {
      const S1 = xor(xor(rotr(e, 14), rotr(e, 18)), rotr(e, 41))
      const ch = xor(and(e, f), and(not(e), g))
      const t1 = add(hh, S1, ch, K512[j], ww[j])
      const S0 = xor(xor(rotr(a, 28), rotr(a, 34)), rotr(a, 39))
      const maj = xor(xor(and(a, b), and(a, c)), and(b, c))
      const t2 = add(S0, maj)
      hh = g; g = f; f = e; e = add(d, t1); d = c; c = b; b = a; a = add(t1, t2)
    }
    h[0] = add(h[0], a); h[1] = add(h[1], b); h[2] = add(h[2], c); h[3] = add(h[3], d)
    h[4] = add(h[4], e); h[5] = add(h[5], f); h[6] = add(h[6], g); h[7] = add(h[7], hh)
  }
  const out = []
  for (let i = 0; i < h.length; i++) {
    const hi = h[i][0], lo = h[i][1]
    out.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff)
    out.push((lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff)
  }
  return out
}

// Generic HMAC for SHA-256 / SHA-512 (array-based)
function hmac(hashFn, blockSize, key, message) {
  key = Array.from(key)
  if (key.length > blockSize) key = hashFn(key)
  while (key.length < blockSize) key.push(0)
  const oKeyPad = key.map(b => b ^ 0x5c)
  const iKeyPad = key.map(b => b ^ 0x36)
  const inner = hashFn([...iKeyPad, ...message])
  return hashFn([...oKeyPad, ...inner])
}

function hmacForAlgorithm(algorithm, key, message) {
  if (algorithm === 'SHA256') return hmac(sha256, 64, key, message)
  if (algorithm === 'SHA512') return hmac(sha512, 128, key, message)
  return hmacSha1(key, message)
}

/**
 * Generate TOTP code with caching
 */
export function generateTOTP(secret, digits = 6, period = 30, algorithm = 'SHA1') {
  const currentPeriod = Math.floor(Date.now() / 1000 / period)

  // Check cache (keyed by secret + algorithm in case the same secret is reused)
  const cacheKey = algorithm + ':' + secret
  const cached = codeCache.get(cacheKey)
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

  const hash = hmacForAlgorithm(algorithm, key, timeBytes)

  // Dynamic truncation (offset from the low nibble of the last byte)
  const offset = hash[hash.length - 1] & 0x0f
  const code = ((hash[offset] & 0x7f) << 24) |
               ((hash[offset + 1] & 0xff) << 16) |
               ((hash[offset + 2] & 0xff) << 8) |
               (hash[offset + 3] & 0xff)

  const otp = (code % Math.pow(10, digits)).toString().padStart(digits, '0')

  // Cache result
  codeCache.set(cacheKey, { code: otp, period: currentPeriod })

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

/**
 * Get formatted TOTP code for account
 */
export const getCode = (acc) => formatCode(generateTOTP(acc.secret, acc.digits || 6, acc.period || 30, acc.algorithm || 'SHA1'))
