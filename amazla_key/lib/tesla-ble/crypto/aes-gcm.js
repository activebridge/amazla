// AES-128-GCM — pure JS for QuickJS on ZeppOS.
//
// Used by the Tesla INFOTAINMENT domain, which authenticates with
// AES_GCM_Personalized signatures (climate, charging, charge-port, vehicle data).
// The VCSEC domain uses HMAC-SHA256 instead (see hmac.js). Both domains share the
// same ECDH-derived 16-byte session key — only the signature scheme differs.
//
// GCM runs the block cipher in CTR mode for BOTH encryption and decryption, so only
// AES *encryption* is implemented here — no inverse S-box / InvMixColumns. Byte- and
// word-oriented throughout (no BigInt), so it runs on the watch unlike P-256 ECDH.
//
// Verified byte-for-byte against Node's `crypto` aes-128-gcm in __tests__.

// ── AES-128 ──────────────────────────────────────────────────────────────────

const SBOX = new Uint8Array(256)
const RCON = new Uint8Array([0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36])

// Generate the S-box at load (GF(2^8) inverse + affine transform) — avoids a
// 256-entry literal and is self-checking via the test vectors.
;(function initSbox() {
  const rotl8 = (x, s) => ((x << s) | (x >> (8 - s))) & 0xff
  let p = 1
  let q = 1
  do {
    p = (p ^ (p << 1) ^ (p & 0x80 ? 0x1b : 0)) & 0xff
    q = (q ^ (q << 1)) & 0xff
    q = (q ^ (q << 2)) & 0xff
    q = (q ^ (q << 4)) & 0xff
    q = (q ^ (q & 0x80 ? 0x09 : 0)) & 0xff
    const x = q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4)
    SBOX[p] = (x ^ 0x63) & 0xff
  } while (p !== 1)
  SBOX[0] = 0x63
})()

const xtime = (x) => ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 0xff

// AES-128 key schedule: 16-byte key → 176 bytes (11 round keys).
const expandKey = (key) => {
  const w = new Uint8Array(176)
  w.set(key.subarray(0, 16), 0)
  let rcon = 0
  for (let i = 16; i < 176; i += 4) {
    let t0 = w[i - 4]
    let t1 = w[i - 3]
    let t2 = w[i - 2]
    let t3 = w[i - 1]
    if (i % 16 === 0) {
      // RotWord + SubWord + Rcon
      const a = SBOX[t1]
      const b = SBOX[t2]
      const c = SBOX[t3]
      const d = SBOX[t0]
      t0 = a ^ RCON[rcon++]
      t1 = b
      t2 = c
      t3 = d
    }
    w[i] = w[i - 16] ^ t0
    w[i + 1] = w[i - 15] ^ t1
    w[i + 2] = w[i - 14] ^ t2
    w[i + 3] = w[i - 13] ^ t3
  }
  return w
}

const shiftRows = (s) => {
  let t = s[1]
  s[1] = s[5]
  s[5] = s[9]
  s[9] = s[13]
  s[13] = t
  t = s[2]
  s[2] = s[10]
  s[10] = t
  t = s[6]
  s[6] = s[14]
  s[14] = t
  t = s[15]
  s[15] = s[11]
  s[11] = s[7]
  s[7] = s[3]
  s[3] = t
}

const mixColumns = (s) => {
  for (let c = 0; c < 16; c += 4) {
    const a0 = s[c]
    const a1 = s[c + 1]
    const a2 = s[c + 2]
    const a3 = s[c + 3]
    const h = a0 ^ a1 ^ a2 ^ a3
    s[c] = a0 ^ h ^ xtime(a0 ^ a1)
    s[c + 1] = a1 ^ h ^ xtime(a1 ^ a2)
    s[c + 2] = a2 ^ h ^ xtime(a2 ^ a3)
    s[c + 3] = a3 ^ h ^ xtime(a3 ^ a0)
  }
}

// Encrypt one 16-byte block (state is column-major: s[row + 4*col]).
const encryptBlock = (rk, block, out) => {
  const s = new Uint8Array(16)
  for (let i = 0; i < 16; i++) s[i] = block[i] ^ rk[i]
  for (let round = 1; round < 10; round++) {
    for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]]
    shiftRows(s)
    mixColumns(s)
    const off = round * 16
    for (let i = 0; i < 16; i++) s[i] ^= rk[off + i]
  }
  for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]]
  shiftRows(s)
  for (let i = 0; i < 16; i++) out[i] = s[i] ^ rk[160 + i]
}

// ── GCM (Galois/Counter Mode) ────────────────────────────────────────────────

// Multiply X by Y in GF(2^128) per the GCM bit convention (bit 0 = MSB of byte 0,
// reduction polynomial R = 0xe1 || 0...). Right-shift method, 128 iterations.
const gfMul = (X, Y) => {
  const Z = new Uint8Array(16)
  const V = Y.slice()
  for (let i = 0; i < 128; i++) {
    if ((X[i >> 3] >> (7 - (i & 7))) & 1) {
      for (let j = 0; j < 16; j++) Z[j] ^= V[j]
    }
    const lsb = V[15] & 1
    for (let j = 15; j > 0; j--) V[j] = ((V[j] >> 1) | (V[j - 1] << 7)) & 0xff
    V[0] = V[0] >> 1
    if (lsb) V[0] ^= 0xe1
  }
  return Z
}

// GHASH: X_0 = 0; X_i = (X_{i-1} ^ block_i) • H. `data` length must be a multiple of 16.
const ghash = (H, data) => {
  let X = new Uint8Array(16)
  for (let off = 0; off < data.length; off += 16) {
    for (let j = 0; j < 16; j++) X[j] ^= data[off + j]
    X = gfMul(X, H)
  }
  return X
}

const writeUint64BE = (buf, off, value) => {
  // value is a JS number (safe up to 2^53 — far beyond any BLE payload bit-length).
  const hi = Math.floor(value / 0x100000000)
  const lo = value >>> 0
  buf[off] = (hi >>> 24) & 0xff
  buf[off + 1] = (hi >>> 16) & 0xff
  buf[off + 2] = (hi >>> 8) & 0xff
  buf[off + 3] = hi & 0xff
  buf[off + 4] = (lo >>> 24) & 0xff
  buf[off + 5] = (lo >>> 16) & 0xff
  buf[off + 6] = (lo >>> 8) & 0xff
  buf[off + 7] = lo & 0xff
}

// Increment the rightmost 32 bits (big-endian) of a 16-byte counter block.
const inc32 = (block) => {
  for (let i = 15; i >= 12; i--) {
    block[i] = (block[i] + 1) & 0xff
    if (block[i] !== 0) break
  }
}

// CTR-mode keystream XOR (used for both encrypt and decrypt). ctr0 is J0; the
// first data block uses inc32(J0), per GCM.
const ctrXor = (rk, j0, input) => {
  const out = new Uint8Array(input.length)
  const ctr = j0.slice()
  const ks = new Uint8Array(16)
  for (let pos = 0; pos < input.length; pos += 16) {
    inc32(ctr)
    encryptBlock(rk, ctr, ks)
    const n = Math.min(16, input.length - pos)
    for (let j = 0; j < n; j++) out[pos + j] = input[pos + j] ^ ks[j]
  }
  return out
}

const computeTag = (H, rk, j0, aad, ciphertext) => {
  const aadBlocks = (aad.length + 15) & ~15
  const ctBlocks = (ciphertext.length + 15) & ~15
  const g = new Uint8Array(aadBlocks + ctBlocks + 16)
  g.set(aad, 0)
  g.set(ciphertext, aadBlocks)
  writeUint64BE(g, aadBlocks + ctBlocks, aad.length * 8)
  writeUint64BE(g, aadBlocks + ctBlocks + 8, ciphertext.length * 8)
  const S = ghash(H, g)
  const eJ0 = new Uint8Array(16)
  encryptBlock(rk, j0, eJ0)
  const tag = new Uint8Array(16)
  for (let j = 0; j < 16; j++) tag[j] = S[j] ^ eJ0[j]
  return tag
}

// J0 for a 96-bit (12-byte) nonce = nonce || 0x00000001. Tesla uses 12-byte nonces.
const buildJ0 = (nonce) => {
  const j0 = new Uint8Array(16)
  j0.set(nonce.subarray(0, 12), 0)
  j0[15] = 1
  return j0
}

const ctEqual = (a, b) => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/**
 * AES-128-GCM encrypt.
 * @param {Uint8Array} key 16-byte session key
 * @param {Uint8Array} nonce 12-byte nonce (caller-generated, unique per key)
 * @param {Uint8Array} plaintext
 * @param {Uint8Array} aad associated data (authenticated, not encrypted)
 * @returns {{ ciphertext: Uint8Array, tag: Uint8Array }} 16-byte tag
 */
const gcmEncrypt = (key, nonce, plaintext, aad) => {
  const rk = expandKey(key)
  const H = new Uint8Array(16)
  encryptBlock(rk, H, H) // H = E_K(0^128)
  const j0 = buildJ0(nonce)
  const ciphertext = ctrXor(rk, j0, plaintext)
  const tag = computeTag(H, rk, j0, aad || new Uint8Array(0), ciphertext)
  return { ciphertext, tag }
}

/**
 * AES-128-GCM decrypt with authentication.
 * @returns {Uint8Array|null} plaintext, or null if the tag is invalid (do NOT use null as auth-OK)
 */
const gcmDecrypt = (key, nonce, ciphertext, aad, tag) => {
  const rk = expandKey(key)
  const H = new Uint8Array(16)
  encryptBlock(rk, H, H)
  const j0 = buildJ0(nonce)
  const expected = computeTag(H, rk, j0, aad || new Uint8Array(0), ciphertext)
  if (!ctEqual(expected, tag)) return null
  return ctrXor(rk, j0, ciphertext)
}

export { gcmEncrypt, gcmDecrypt }
export default gcmEncrypt
