// SHA-256 / SHA-1 benchmark: original vs optimized
// Run with:  node --expose-gc __tests__/sha256-benchmark.js

import { sha256 as sha256Opt, sha1 as sha1Opt } from '../lib/tesla-ble/crypto/sha256.js'

// ---------------------------------------------------------------------------
// Original implementation — pre-optimization reference
// (Plain Array K/H_INIT, per-call heap buffers, 7 named helper functions)
// ---------------------------------------------------------------------------

const K_ORIG = [
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
]

function rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0 }
function ch(x, y, z)  { return ((x & y) ^ (~x & z)) >>> 0 }
function maj(x, y, z) { return ((x & y) ^ (x & z) ^ (y & z)) >>> 0 }
function sigma0(x) { return (rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22)) >>> 0 }
function sigma1(x) { return (rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25)) >>> 0 }
function gamma0(x) { return (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0 }
function gamma1(x) { return (rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10)) >>> 0 }

function sha256Orig(data) {
  let bytes
  if (data instanceof Uint8Array) bytes = data
  else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data)
  else if (typeof data === 'string') {
    bytes = new Uint8Array(data.length)
    for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i) & 0xff
  } else throw new Error('Invalid input type')

  const bitLen  = bytes.length * 8
  const nBytes  = bytes.length
  // Pad
  const padLen  = 64 - ((nBytes + 9) % 64 || 64)
  const padded  = new Uint8Array(nBytes + 1 + padLen + 8)
  padded.set(bytes)
  padded[nBytes] = 0x80
  const lenOff = padded.length - 8
  padded[lenOff + 4] = (bitLen >>> 24) & 0xff
  padded[lenOff + 5] = (bitLen >>> 16) & 0xff
  padded[lenOff + 6] = (bitLen >>> 8) & 0xff
  padded[lenOff + 7] = bitLen & 0xff

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19

  for (let i = 0; i < padded.length; i += 64) {
    const W = new Array(64)   // <-- per-call heap allocation (the key difference)
    for (let t = 0; t < 16; t++) {
      const o = i + t * 4
      W[t] = ((padded[o] << 24) | (padded[o+1] << 16) | (padded[o+2] << 8) | padded[o+3]) >>> 0
    }
    for (let t = 16; t < 64; t++)
      W[t] = (gamma1(W[t-2]) + W[t-7] + gamma0(W[t-15]) + W[t-16]) >>> 0

    let a = h0, b = h1, c = h2, d = h3
    let e = h4, f = h5, g = h6, h = h7

    for (let t = 0; t < 64; t++) {
      const T1 = (h + sigma1(e) + ch(e, f, g) + K_ORIG[t] + W[t]) >>> 0
      const T2 = (sigma0(a) + maj(a, b, c)) >>> 0
      h = g; g = f; f = e
      e = (d + T1) >>> 0
      d = c; c = b; b = a
      a = (T1 + T2) >>> 0
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0
  }

  const out = new Uint8Array(32)
  const hs = [h0, h1, h2, h3, h4, h5, h6, h7]
  for (let i = 0; i < 8; i++) {
    out[i*4]   = (hs[i] >>> 24) & 0xff
    out[i*4+1] = (hs[i] >>> 16) & 0xff
    out[i*4+2] = (hs[i] >>>  8) & 0xff
    out[i*4+3] =  hs[i]         & 0xff
  }
  return out
}

function sha1Orig(data) {
  let bytes
  if (data instanceof Uint8Array) bytes = data
  else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data)
  else if (typeof data === 'string') {
    bytes = new Uint8Array(data.length)
    for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i) & 0xff
  } else throw new Error('Invalid input type')

  const bitLen = bytes.length * 8
  const nBytes = bytes.length
  const padLen = 64 - ((nBytes + 9) % 64 || 64)
  const padded = new Uint8Array(nBytes + 1 + padLen + 8)
  padded.set(bytes)
  padded[nBytes] = 0x80
  const lenOff = padded.length - 8
  padded[lenOff + 4] = (bitLen >>> 24) & 0xff
  padded[lenOff + 5] = (bitLen >>> 16) & 0xff
  padded[lenOff + 6] = (bitLen >>> 8) & 0xff
  padded[lenOff + 7] = bitLen & 0xff

  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE
  let h3 = 0x10325476, h4 = 0xC3D2E1F0

  for (let i = 0; i < padded.length; i += 64) {
    const W = new Array(80)   // <-- per-call heap allocation
    for (let j = 0; j < 16; j++) {
      const o = i + j * 4
      W[j] = ((padded[o] << 24) | (padded[o+1] << 16) | (padded[o+2] << 8) | padded[o+3]) >>> 0
    }
    for (let j = 16; j < 80; j++) {
      const n = W[j-3] ^ W[j-8] ^ W[j-14] ^ W[j-16]
      W[j] = ((n << 1) | (n >>> 31)) >>> 0
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4
    for (let j = 0; j < 80; j++) {
      let f, k
      if (j < 20)      { f = (b & c) | (~b & d); k = 0x5A827999 }
      else if (j < 40) { f = b ^ c ^ d;           k = 0x6ED9EBA1 }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC }
      else             { f = b ^ c ^ d;           k = 0xCA62C1D6 }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + W[j]) >>> 0
      e = d; d = c
      c = ((b << 30) | (b >>> 2)) >>> 0
      b = a; a = temp
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0
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

// ---------------------------------------------------------------------------
// Benchmark harness
// ---------------------------------------------------------------------------

const ITERATIONS = 5000

function bench(label, fn, input) {
  // Warm up JIT
  for (let i = 0; i < 50; i++) fn(input)

  if (typeof globalThis.gc === 'function') globalThis.gc()
  const memBefore = process.memoryUsage().heapUsed

  const t0 = performance.now()
  for (let i = 0; i < ITERATIONS; i++) fn(input)
  const elapsed = performance.now() - t0

  if (typeof globalThis.gc === 'function') globalThis.gc()
  const memAfter = process.memoryUsage().heapUsed

  const opsPerSec = Math.round(ITERATIONS / (elapsed / 1000))
  const heapDelta = memAfter - memBefore  // bytes allocated and retained

  return { label, elapsed: elapsed.toFixed(1), opsPerSec, heapDelta }
}

function printTable(title, rows) {
  console.log(`\n${title}`)
  console.log('─'.repeat(70))
  console.log(`${'Label'.padEnd(28)} ${'ms'.padStart(8)} ${'ops/sec'.padStart(10)} ${'heap Δ bytes'.padStart(14)}`)
  console.log('─'.repeat(70))
  for (const r of rows) {
    const flag = r.label.includes('orig') ? '' : ' ← optimized'
    console.log(
      `${(r.label + flag).padEnd(28)} ${String(r.elapsed).padStart(8)} ${String(r.opsPerSec).padStart(10)} ${String(r.heapDelta).padStart(14)}`
    )
  }
  console.log('─'.repeat(70))

  // speedup summary
  if (rows.length === 2) {
    const speedup = (rows[0].elapsed / rows[1].elapsed).toFixed(2)
    const heapSaved = rows[0].heapDelta - rows[1].heapDelta
    const sign = heapSaved >= 0 ? '-' : '+'
    console.log(`Speedup: ${speedup}×   Heap saved per run: ${sign}${Math.abs(heapSaved)} bytes`)
  }
}

// Inputs
const SMALL  = new Uint8Array(32).fill(0xab)           // 32 B  — single block, common (ECDH x-coord)
const MEDIUM = new Uint8Array(128).fill(0x42)          // 128 B — 2 blocks
const LARGE  = new Uint8Array(1000).fill(0x61)         // 1000 B — 16 blocks

console.log(`\nSHA-256 / SHA-1 benchmark  (${ITERATIONS.toLocaleString()} iterations each)`)
if (typeof globalThis.gc !== 'function') {
  console.log('  Note: run with --expose-gc for accurate heap delta measurements')
}

printTable('SHA-256  —  32 bytes (ECDH x-coord)', [
  bench('orig  32B', sha256Orig, SMALL),
  bench('opt   32B', sha256Opt,  SMALL),
])

printTable('SHA-256  —  128 bytes', [
  bench('orig 128B', sha256Orig, MEDIUM),
  bench('opt  128B', sha256Opt,  MEDIUM),
])

printTable('SHA-256  —  1000 bytes', [
  bench('orig  1kB', sha256Orig, LARGE),
  bench('opt   1kB', sha256Opt,  LARGE),
])

printTable('SHA-1    —  32 bytes', [
  bench('orig  32B', sha1Orig, SMALL),
  bench('opt   32B', sha1Opt,  SMALL),
])

printTable('SHA-1    —  1000 bytes', [
  bench('orig  1kB', sha1Orig, LARGE),
  bench('opt   1kB', sha1Opt,  LARGE),
])
