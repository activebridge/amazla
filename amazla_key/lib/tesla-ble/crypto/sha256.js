// SHA-256 and SHA-1 — optimized for QuickJS on ZeppOS
//
// Optimizations vs. original:
//   - K and H_INIT use Uint32Array (4 bytes/entry vs ~16 bytes for plain Array)
//   - _W / _W1 pre-allocated at module scope — no per-call heap allocation
//   - Helper functions (rotr, ch, maj, sigma*, gamma*) inlined into the inner
//     loops — removes 7 function objects and eliminates call overhead
//   - padMessage shared between SHA-256 and SHA-1
//   - bytesToWords eliminated — words read directly into _W

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const H_INIT = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
])

// Pre-allocated work buffers — reused across calls (safe: synchronous only)
const _W  = new Uint32Array(64)  // SHA-256 message schedule
const _W1 = new Uint32Array(80)  // SHA-1 message schedule

function toBytes(data) {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (typeof data === 'string') {
    const b = new Uint8Array(data.length)
    for (let i = 0; i < data.length; i++) b[i] = data.charCodeAt(i) & 0xff
    return b
  }
  throw new Error('Invalid input type')
}

function padMessage(bytes) {
  const bitLength = bytes.length * 8
  let paddingLength = 64 - ((bytes.length + 9) % 64)
  if (paddingLength === 64) paddingLength = 0
  const padded = new Uint8Array(bytes.length + 1 + paddingLength + 8)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const lo = padded.length - 8
  padded[lo + 4] = (bitLength >>> 24) & 0xff
  padded[lo + 5] = (bitLength >>> 16) & 0xff
  padded[lo + 6] = (bitLength >>> 8) & 0xff
  padded[lo + 7] = bitLength & 0xff
  return padded
}

function processBlock256(p, offset, H) {
  // Load 16 words directly from padded buffer
  for (let t = 0; t < 16; t++) {
    const o = offset + t * 4
    _W[t] = ((p[o] << 24) | (p[o+1] << 16) | (p[o+2] << 8) | p[o+3]) >>> 0
  }
  // Expand message schedule — gamma0/gamma1 inlined
  for (let t = 16; t < 64; t++) {
    const w2  = _W[t - 2]
    const w15 = _W[t - 15]
    const g1  = (((w2  >>> 17) | (w2  << 15)) ^ ((w2  >>> 19) | (w2  << 13)) ^ (w2  >>> 10)) >>> 0
    const g0  = (((w15 >>>  7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>>  3)) >>> 0
    _W[t] = (g1 + _W[t - 7] + g0 + _W[t - 16]) >>> 0
  }
  let a = H[0], b = H[1], c = H[2], d = H[3]
  let e = H[4], f = H[5], g = H[6], h = H[7]
  // Compression — sigma0/sigma1/ch/maj inlined
  for (let t = 0; t < 64; t++) {
    const s1 = (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) >>> 0
    const ch = ((e & f) ^ (~e & g)) >>> 0
    const T1 = (h + s1 + ch + K[t] + _W[t]) >>> 0
    const s0 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) >>> 0
    const mj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0
    const T2 = (s0 + mj) >>> 0
    h = g; g = f; f = e
    e = (d + T1) >>> 0
    d = c; c = b; b = a
    a = (T1 + T2) >>> 0
  }
  H[0] = (H[0] + a) >>> 0
  H[1] = (H[1] + b) >>> 0
  H[2] = (H[2] + c) >>> 0
  H[3] = (H[3] + d) >>> 0
  H[4] = (H[4] + e) >>> 0
  H[5] = (H[5] + f) >>> 0
  H[6] = (H[6] + g) >>> 0
  H[7] = (H[7] + h) >>> 0
}

function sha256(data) {
  const bytes  = toBytes(data)
  const padded = padMessage(bytes)
  const H = H_INIT.slice()
  for (let i = 0; i < padded.length; i += 64) processBlock256(padded, i, H)
  const out = new Uint8Array(32)
  for (let i = 0; i < 8; i++) {
    out[i*4]   = (H[i] >>> 24) & 0xff
    out[i*4+1] = (H[i] >>> 16) & 0xff
    out[i*4+2] = (H[i] >>>  8) & 0xff
    out[i*4+3] =  H[i]         & 0xff
  }
  return out
}

function sha1(data) {
  const bytes  = toBytes(data)
  const padded = padMessage(bytes)
  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE
  let h3 = 0x10325476, h4 = 0xC3D2E1F0
  for (let i = 0; i < padded.length; i += 64) {
    const base = i
    for (let j = 0; j < 16; j++) {
      const o = base + j * 4
      _W1[j] = ((padded[o] << 24) | (padded[o+1] << 16) | (padded[o+2] << 8) | padded[o+3]) >>> 0
    }
    for (let j = 16; j < 80; j++) {
      const n = _W1[j-3] ^ _W1[j-8] ^ _W1[j-14] ^ _W1[j-16]
      _W1[j] = ((n << 1) | (n >>> 31)) >>> 0
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4
    for (let j = 0; j < 80; j++) {
      let f, k
      if (j < 20) {
        f = (b & c) | (~b & d)
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
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + _W1[j]) >>> 0
      e = d; d = c
      c = ((b << 30) | (b >>> 2)) >>> 0
      b = a; a = temp
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }
  const out = new Uint8Array(20)
  const hs = [h0, h1, h2, h3, h4]
  for (let i = 0; i < 5; i++) {
    out[i*4]   = (hs[i] >>> 24) & 0xff
    out[i*4+1] = (hs[i] >>> 16) & 0xff
    out[i*4+2] = (hs[i] >>>  8) & 0xff
    out[i*4+3] =  hs[i]         & 0xff
  }
  return out
}

export { sha256, sha1 }
export default sha256
