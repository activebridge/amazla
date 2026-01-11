// AES-128-GCM implementation for Tesla BLE
// Tesla uses non-standard 4-byte nonce (counter-based)

// AES S-box
const SBOX = [
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
]

// Rcon for key expansion
const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]

// Galois field multiplication
function gmul(a, b) {
  let p = 0
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a
    const hiBit = a & 0x80
    a = (a << 1) & 0xff
    if (hiBit) a ^= 0x1b
    b >>= 1
  }
  return p
}

// Key expansion for AES-128
function keyExpansion(key) {
  const w = new Uint8Array(176) // 11 round keys * 16 bytes
  w.set(key.slice(0, 16))

  for (let i = 16; i < 176; i += 4) {
    let t0 = w[i - 4]
    let t1 = w[i - 3]
    let t2 = w[i - 2]
    let t3 = w[i - 1]

    if (i % 16 === 0) {
      // RotWord + SubWord + Rcon
      const tmp = t0
      t0 = SBOX[t1] ^ RCON[i / 16 - 1]
      t1 = SBOX[t2]
      t2 = SBOX[t3]
      t3 = SBOX[tmp]
    }

    w[i] = w[i - 16] ^ t0
    w[i + 1] = w[i - 15] ^ t1
    w[i + 2] = w[i - 14] ^ t2
    w[i + 3] = w[i - 13] ^ t3
  }

  return w
}

// AES block encryption (single 16-byte block)
function aesEncryptBlock(block, expandedKey) {
  const state = new Uint8Array(block)

  // Initial round key addition
  for (let i = 0; i < 16; i++) {
    state[i] ^= expandedKey[i]
  }

  // 9 main rounds
  for (let round = 1; round < 10; round++) {
    // SubBytes
    for (let i = 0; i < 16; i++) {
      state[i] = SBOX[state[i]]
    }

    // ShiftRows
    let tmp = state[1]
    state[1] = state[5]
    state[5] = state[9]
    state[9] = state[13]
    state[13] = tmp

    tmp = state[2]
    state[2] = state[10]
    state[10] = tmp
    tmp = state[6]
    state[6] = state[14]
    state[14] = tmp

    tmp = state[3]
    state[3] = state[15]
    state[15] = state[11]
    state[11] = state[7]
    state[7] = tmp

    // MixColumns
    for (let i = 0; i < 16; i += 4) {
      const a = state[i]
      const b = state[i + 1]
      const c = state[i + 2]
      const d = state[i + 3]

      state[i] = gmul(a, 2) ^ gmul(b, 3) ^ c ^ d
      state[i + 1] = a ^ gmul(b, 2) ^ gmul(c, 3) ^ d
      state[i + 2] = a ^ b ^ gmul(c, 2) ^ gmul(d, 3)
      state[i + 3] = gmul(a, 3) ^ b ^ c ^ gmul(d, 2)
    }

    // AddRoundKey
    const keyOffset = round * 16
    for (let i = 0; i < 16; i++) {
      state[i] ^= expandedKey[keyOffset + i]
    }
  }

  // Final round (no MixColumns)
  for (let i = 0; i < 16; i++) {
    state[i] = SBOX[state[i]]
  }

  // ShiftRows
  let tmp = state[1]
  state[1] = state[5]
  state[5] = state[9]
  state[9] = state[13]
  state[13] = tmp

  tmp = state[2]
  state[2] = state[10]
  state[10] = tmp
  tmp = state[6]
  state[6] = state[14]
  state[14] = tmp

  tmp = state[3]
  state[3] = state[15]
  state[15] = state[11]
  state[11] = state[7]
  state[7] = tmp

  // AddRoundKey
  for (let i = 0; i < 16; i++) {
    state[i] ^= expandedKey[160 + i]
  }

  return state
}

// GCM: Galois field multiplication for GHASH
function gcmMultiply(x, h) {
  // x and h are 16-byte arrays
  // Result is also 16 bytes

  const z = new Uint8Array(16)
  const v = new Uint8Array(h)

  for (let i = 0; i < 16; i++) {
    for (let j = 7; j >= 0; j--) {
      if ((x[i] >> j) & 1) {
        for (let k = 0; k < 16; k++) {
          z[k] ^= v[k]
        }
      }

      // Multiply v by x (shift right and reduce)
      const lsb = v[15] & 1
      for (let k = 15; k > 0; k--) {
        v[k] = (v[k] >> 1) | ((v[k - 1] & 1) << 7)
      }
      v[0] >>= 1

      if (lsb) {
        v[0] ^= 0xe1 // Reduction polynomial
      }
    }
  }

  return z
}

// GHASH function
function ghash(h, aad, ciphertext) {
  let result = new Uint8Array(16)

  // Process AAD
  const aadBlocks = Math.ceil(aad.length / 16)
  for (let i = 0; i < aadBlocks; i++) {
    const block = new Uint8Array(16)
    const start = i * 16
    const end = Math.min(start + 16, aad.length)
    block.set(aad.slice(start, end))

    for (let j = 0; j < 16; j++) {
      result[j] ^= block[j]
    }
    result = gcmMultiply(result, h)
  }

  // Process ciphertext
  const ctBlocks = Math.ceil(ciphertext.length / 16)
  for (let i = 0; i < ctBlocks; i++) {
    const block = new Uint8Array(16)
    const start = i * 16
    const end = Math.min(start + 16, ciphertext.length)
    block.set(ciphertext.slice(start, end))

    for (let j = 0; j < 16; j++) {
      result[j] ^= block[j]
    }
    result = gcmMultiply(result, h)
  }

  // Length block: aad_len (64 bits) || ct_len (64 bits)
  const lenBlock = new Uint8Array(16)
  const aadBits = aad.length * 8
  const ctBits = ciphertext.length * 8

  lenBlock[4] = (aadBits >>> 24) & 0xff
  lenBlock[5] = (aadBits >>> 16) & 0xff
  lenBlock[6] = (aadBits >>> 8) & 0xff
  lenBlock[7] = aadBits & 0xff

  lenBlock[12] = (ctBits >>> 24) & 0xff
  lenBlock[13] = (ctBits >>> 16) & 0xff
  lenBlock[14] = (ctBits >>> 8) & 0xff
  lenBlock[15] = ctBits & 0xff

  for (let j = 0; j < 16; j++) {
    result[j] ^= lenBlock[j]
  }
  result = gcmMultiply(result, h)

  return result
}

// Increment counter (last 4 bytes, big-endian)
function incrementCounter(counter) {
  const result = new Uint8Array(counter)
  for (let i = 15; i >= 12; i--) {
    result[i]++
    if (result[i] !== 0) break
  }
  return result
}

// AES-GCM encrypt
// Tesla uses 4-byte nonce derived from counter
function aesGcmEncrypt(key, nonce, plaintext, aad) {
  const expandedKey = keyExpansion(key)

  // Build 16-byte IV: 12 bytes of zeros + 4-byte nonce
  // Tesla format: nonce is 4-byte counter in big-endian
  const iv = new Uint8Array(16)
  if (nonce.length === 4) {
    // Tesla's 4-byte nonce goes at the end
    iv.set(nonce, 12)
  } else if (nonce.length === 12) {
    // Standard 12-byte nonce
    iv.set(nonce)
    iv[15] = 1 // Counter starts at 1
  } else {
    throw new Error('Invalid nonce length')
  }

  // Compute H = E(K, 0^128)
  const h = aesEncryptBlock(new Uint8Array(16), expandedKey)

  // Encrypt plaintext using CTR mode
  const ciphertext = new Uint8Array(plaintext.length)
  let counter = new Uint8Array(iv)
  counter = incrementCounter(counter) // Start at 1 for encryption

  for (let i = 0; i < plaintext.length; i += 16) {
    const keystream = aesEncryptBlock(counter, expandedKey)
    const blockLen = Math.min(16, plaintext.length - i)

    for (let j = 0; j < blockLen; j++) {
      ciphertext[i + j] = plaintext[i + j] ^ keystream[j]
    }

    counter = incrementCounter(counter)
  }

  // Compute authentication tag
  const ghashResult = ghash(h, aad, ciphertext)
  const j0 = new Uint8Array(iv)
  if (nonce.length !== 4) {
    j0[15] = 1
  }
  const encJ0 = aesEncryptBlock(j0, expandedKey)

  const tag = new Uint8Array(16)
  for (let i = 0; i < 16; i++) {
    tag[i] = ghashResult[i] ^ encJ0[i]
  }

  return { ciphertext, tag }
}

// AES-GCM decrypt
function aesGcmDecrypt(key, nonce, ciphertext, aad, tag) {
  const expandedKey = keyExpansion(key)

  // Build IV
  const iv = new Uint8Array(16)
  if (nonce.length === 4) {
    iv.set(nonce, 12)
  } else if (nonce.length === 12) {
    iv.set(nonce)
    iv[15] = 1
  } else {
    throw new Error('Invalid nonce length')
  }

  // Compute H
  const h = aesEncryptBlock(new Uint8Array(16), expandedKey)

  // Verify tag
  const ghashResult = ghash(h, aad, ciphertext)
  const j0 = new Uint8Array(iv)
  if (nonce.length !== 4) {
    j0[15] = 1
  }
  const encJ0 = aesEncryptBlock(j0, expandedKey)

  const expectedTag = new Uint8Array(16)
  for (let i = 0; i < 16; i++) {
    expectedTag[i] = ghashResult[i] ^ encJ0[i]
  }

  // Compare tags
  let valid = true
  for (let i = 0; i < 16; i++) {
    if (expectedTag[i] !== tag[i]) {
      valid = false
    }
  }

  if (!valid) {
    throw new Error('Authentication failed')
  }

  // Decrypt ciphertext
  const plaintext = new Uint8Array(ciphertext.length)
  let counter = new Uint8Array(iv)
  counter = incrementCounter(counter)

  for (let i = 0; i < ciphertext.length; i += 16) {
    const keystream = aesEncryptBlock(counter, expandedKey)
    const blockLen = Math.min(16, ciphertext.length - i)

    for (let j = 0; j < blockLen; j++) {
      plaintext[i + j] = ciphertext[i + j] ^ keystream[j]
    }

    counter = incrementCounter(counter)
  }

  return plaintext
}

// Create 4-byte nonce from counter (Tesla format)
function counterToNonce(counter) {
  const nonce = new Uint8Array(4)
  nonce[0] = (counter >>> 24) & 0xff
  nonce[1] = (counter >>> 16) & 0xff
  nonce[2] = (counter >>> 8) & 0xff
  nonce[3] = counter & 0xff
  return nonce
}

export { aesGcmEncrypt, aesGcmDecrypt, counterToNonce }
