// Pure JavaScript SHA-256 implementation
// No dependencies, works on ZeppOS

// SHA-256 round constants
const K = [
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
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]

// Initial hash values
const H_INIT = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]

// Right rotate
function rotr(x, n) {
  return ((x >>> n) | (x << (32 - n))) >>> 0
}

// SHA-256 functions
function ch(x, y, z) {
  return ((x & y) ^ (~x & z)) >>> 0
}

function maj(x, y, z) {
  return ((x & y) ^ (x & z) ^ (y & z)) >>> 0
}

function sigma0(x) {
  return (rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22)) >>> 0
}

function sigma1(x) {
  return (rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25)) >>> 0
}

function gamma0(x) {
  return (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0
}

function gamma1(x) {
  return (rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10)) >>> 0
}

// Convert bytes to 32-bit words (big-endian)
function bytesToWords(bytes) {
  const words = []
  for (let i = 0; i < bytes.length; i += 4) {
    words.push(
      ((bytes[i] << 24) |
       (bytes[i + 1] << 16) |
       (bytes[i + 2] << 8) |
       bytes[i + 3]) >>> 0
    )
  }
  return words
}

// Convert 32-bit words to bytes (big-endian)
function wordsToBytes(words) {
  const bytes = new Uint8Array(words.length * 4)
  for (let i = 0; i < words.length; i++) {
    bytes[i * 4] = (words[i] >>> 24) & 0xff
    bytes[i * 4 + 1] = (words[i] >>> 16) & 0xff
    bytes[i * 4 + 2] = (words[i] >>> 8) & 0xff
    bytes[i * 4 + 3] = words[i] & 0xff
  }
  return bytes
}

// Pad message to 512-bit blocks
function padMessage(bytes) {
  const bitLength = bytes.length * 8

  // Calculate padding length
  // Message + 1 bit + padding + 64-bit length = multiple of 512 bits
  let paddingLength = 64 - ((bytes.length + 9) % 64)
  if (paddingLength === 64) paddingLength = 0

  const padded = new Uint8Array(bytes.length + 1 + paddingLength + 8)

  // Copy original message
  padded.set(bytes)

  // Append 1 bit (0x80)
  padded[bytes.length] = 0x80

  // Append length in bits as 64-bit big-endian
  // For messages < 2^32 bits, upper 32 bits are 0
  const lengthOffset = padded.length - 8
  padded[lengthOffset + 4] = (bitLength >>> 24) & 0xff
  padded[lengthOffset + 5] = (bitLength >>> 16) & 0xff
  padded[lengthOffset + 6] = (bitLength >>> 8) & 0xff
  padded[lengthOffset + 7] = bitLength & 0xff

  return padded
}

// Process a 512-bit block
function processBlock(block, H) {
  const W = new Array(64)

  // Prepare message schedule
  for (let t = 0; t < 16; t++) {
    W[t] = block[t]
  }
  for (let t = 16; t < 64; t++) {
    W[t] = (gamma1(W[t - 2]) + W[t - 7] + gamma0(W[t - 15]) + W[t - 16]) >>> 0
  }

  // Initialize working variables
  let a = H[0], b = H[1], c = H[2], d = H[3]
  let e = H[4], f = H[5], g = H[6], h = H[7]

  // Main loop
  for (let t = 0; t < 64; t++) {
    const T1 = (h + sigma1(e) + ch(e, f, g) + K[t] + W[t]) >>> 0
    const T2 = (sigma0(a) + maj(a, b, c)) >>> 0

    h = g
    g = f
    f = e
    e = (d + T1) >>> 0
    d = c
    c = b
    b = a
    a = (T1 + T2) >>> 0
  }

  // Compute new hash values
  H[0] = (H[0] + a) >>> 0
  H[1] = (H[1] + b) >>> 0
  H[2] = (H[2] + c) >>> 0
  H[3] = (H[3] + d) >>> 0
  H[4] = (H[4] + e) >>> 0
  H[5] = (H[5] + f) >>> 0
  H[6] = (H[6] + g) >>> 0
  H[7] = (H[7] + h) >>> 0
}

// Main SHA-256 function
function sha256(data) {
  // Convert input to Uint8Array if needed
  let bytes
  if (typeof data === 'string') {
    bytes = new Uint8Array(data.length)
    for (let i = 0; i < data.length; i++) {
      bytes[i] = data.charCodeAt(i) & 0xff
    }
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data)
  } else if (data instanceof Uint8Array) {
    bytes = data
  } else {
    throw new Error('Invalid input type for sha256')
  }

  // Initialize hash values
  const H = H_INIT.slice()

  // Pad message
  const padded = padMessage(bytes)

  // Process each 512-bit (64-byte) block
  for (let i = 0; i < padded.length; i += 64) {
    const block = bytesToWords(padded.slice(i, i + 64))
    processBlock(block, H)
  }

  // Return hash as Uint8Array
  return wordsToBytes(H)
}

// SHA-1 (needed for Tesla session key derivation)
function sha1(data) {
  // Convert input to Uint8Array
  let bytes
  if (typeof data === 'string') {
    bytes = new Uint8Array(data.length)
    for (let i = 0; i < data.length; i++) {
      bytes[i] = data.charCodeAt(i) & 0xff
    }
  } else if (data instanceof Uint8Array) {
    bytes = data
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data)
  } else {
    throw new Error('Invalid input type for sha1')
  }

  // SHA-1 initial hash values
  let h0 = 0x67452301
  let h1 = 0xEFCDAB89
  let h2 = 0x98BADCFE
  let h3 = 0x10325476
  let h4 = 0xC3D2E1F0

  // Pre-processing: adding padding bits
  const bitLength = bytes.length * 8
  let paddingLength = 64 - ((bytes.length + 9) % 64)
  if (paddingLength === 64) paddingLength = 0

  const padded = new Uint8Array(bytes.length + 1 + paddingLength + 8)
  padded.set(bytes)
  padded[bytes.length] = 0x80

  // Append length
  const lengthOffset = padded.length - 8
  padded[lengthOffset + 4] = (bitLength >>> 24) & 0xff
  padded[lengthOffset + 5] = (bitLength >>> 16) & 0xff
  padded[lengthOffset + 6] = (bitLength >>> 8) & 0xff
  padded[lengthOffset + 7] = bitLength & 0xff

  // Process each 512-bit block
  for (let i = 0; i < padded.length; i += 64) {
    const W = new Array(80)

    // Break chunk into sixteen 32-bit words
    for (let j = 0; j < 16; j++) {
      W[j] = (padded[i + j * 4] << 24) |
             (padded[i + j * 4 + 1] << 16) |
             (padded[i + j * 4 + 2] << 8) |
             padded[i + j * 4 + 3]
    }

    // Extend to 80 words
    for (let j = 16; j < 80; j++) {
      const n = W[j - 3] ^ W[j - 8] ^ W[j - 14] ^ W[j - 16]
      W[j] = ((n << 1) | (n >>> 31)) >>> 0
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

      const temp = (((a << 5) | (a >>> 27)) + f + e + k + W[j]) >>> 0
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

  // Produce final hash
  const hash = new Uint8Array(20)
  hash[0] = (h0 >>> 24) & 0xff
  hash[1] = (h0 >>> 16) & 0xff
  hash[2] = (h0 >>> 8) & 0xff
  hash[3] = h0 & 0xff
  hash[4] = (h1 >>> 24) & 0xff
  hash[5] = (h1 >>> 16) & 0xff
  hash[6] = (h1 >>> 8) & 0xff
  hash[7] = h1 & 0xff
  hash[8] = (h2 >>> 24) & 0xff
  hash[9] = (h2 >>> 16) & 0xff
  hash[10] = (h2 >>> 8) & 0xff
  hash[11] = h2 & 0xff
  hash[12] = (h3 >>> 24) & 0xff
  hash[13] = (h3 >>> 16) & 0xff
  hash[14] = (h3 >>> 8) & 0xff
  hash[15] = h3 & 0xff
  hash[16] = (h4 >>> 24) & 0xff
  hash[17] = (h4 >>> 16) & 0xff
  hash[18] = (h4 >>> 8) & 0xff
  hash[19] = h4 & 0xff

  return hash
}

export { sha256, sha1 }
export default sha256
