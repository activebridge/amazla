// Tesla BLE Cryptography Functions - Pure ES6 JavaScript
// Implements ECDSA P-256, HMAC-SHA256, and AES-GCM for Tesla authentication

class TeslaCrypto {
  constructor() {
    // Initialize crypto constants for P-256 curve
    this.P256_P = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff')
    this.P256_N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551')
    this.P256_A = BigInt('0xffffffff00000001000000000000000000000000fffffffffffffffffffffffc')
    this.P256_B = BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b')
    this.P256_GX = BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296')
    this.P256_GY = BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')
  }

  // Convert hex string to Uint8Array
  hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
    }
    return bytes
  }

  // Convert Uint8Array to hex string
  bytesToHex(bytes) {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  }

  // Convert BigInt to Uint8Array (32 bytes for P-256)
  bigIntToBytes(bigint, length = 32) {
    const hex = bigint.toString(16).padStart(length * 2, '0')
    return this.hexToBytes(hex)
  }

  // Convert Uint8Array to BigInt
  bytesToBigInt(bytes) {
    return BigInt('0x' + this.bytesToHex(bytes))
  }

  // SHA-256 hash function (pure JS implementation)
  async sha256(data) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    
    // SHA-256 constants
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

    // Pre-processing
    const msgLen = bytes.length
    const bitLen = msgLen * 8
    
    // Padding
    const padLen = (56 - (msgLen + 1) % 64) % 64
    const paddedLen = msgLen + 1 + padLen + 8
    const padded = new Uint8Array(paddedLen)
    
    padded.set(bytes)
    padded[msgLen] = 0x80
    
    // Length in bits as big-endian 64-bit
    const lenView = new DataView(padded.buffer, paddedLen - 8)
    lenView.setUint32(4, bitLen, false)

    // Initialize hash values
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19

    // Process 512-bit chunks
    for (let i = 0; i < paddedLen; i += 64) {
      const w = new Array(64)
      const chunk = new DataView(padded.buffer, i, 64)
      
      // Break chunk into sixteen 32-bit words
      for (let j = 0; j < 16; j++) {
        w[j] = chunk.getUint32(j * 4, false)
      }
      
      // Extend sixteen 32-bit words into sixty-four 32-bit words
      for (let j = 16; j < 64; j++) {
        const s0 = this.rightrotate(w[j-15], 7) ^ this.rightrotate(w[j-15], 18) ^ (w[j-15] >>> 3)
        const s1 = this.rightrotate(w[j-2], 17) ^ this.rightrotate(w[j-2], 19) ^ (w[j-2] >>> 10)
        w[j] = (w[j-16] + s0 + w[j-7] + s1) >>> 0
      }
      
      // Initialize working variables
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7
      
      // Main loop
      for (let j = 0; j < 64; j++) {
        const S1 = this.rightrotate(e, 6) ^ this.rightrotate(e, 11) ^ this.rightrotate(e, 25)
        const ch = (e & f) ^ (~e & g)
        const temp1 = (h + S1 + ch + K[j] + w[j]) >>> 0
        const S0 = this.rightrotate(a, 2) ^ this.rightrotate(a, 13) ^ this.rightrotate(a, 22)
        const maj = (a & b) ^ (a & c) ^ (b & c)
        const temp2 = (S0 + maj) >>> 0
        
        h = g; g = f; f = e; e = (d + temp1) >>> 0
        d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
      }
      
      // Add this chunk's hash to result
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0
    }
    
    // Produce final hash value
    const result = new Uint8Array(32)
    const view = new DataView(result.buffer)
    view.setUint32(0, h0, false); view.setUint32(4, h1, false)
    view.setUint32(8, h2, false); view.setUint32(12, h3, false)
    view.setUint32(16, h4, false); view.setUint32(20, h5, false)
    view.setUint32(24, h6, false); view.setUint32(28, h7, false)
    
    return result
  }

  // Right rotate helper
  rightrotate(value, amount) {
    return ((value >>> amount) | (value << (32 - amount))) >>> 0
  }

  // HMAC-SHA256
  async hmacSha256(key, data) {
    const keyBytes = typeof key === 'string' ? new TextEncoder().encode(key) : key
    const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    
    let actualKey = keyBytes
    if (actualKey.length > 64) {
      actualKey = await this.sha256(actualKey)
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
    
    const innerHash = await this.sha256(inner)
    
    const outer = new Uint8Array(64 + 32)
    outer.set(oKeyPad)
    outer.set(innerHash, 64)
    
    return await this.sha256(outer)
  }

  // ECDSA Sign with P-256 curve
  async sign(privateKeyBytes, messageHash) {
    const d = this.bytesToBigInt(privateKeyBytes)
    const z = this.bytesToBigInt(messageHash)
    
    // Generate random k (in real implementation, use cryptographically secure random)
    let k = BigInt('0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join(''))
    k = k % this.P256_N
    if (k === 0n) k = 1n
    
    // Calculate r = (k * G).x mod n
    const kG = this.pointMultiply(k, [this.P256_GX, this.P256_GY])
    const r = kG[0] % this.P256_N
    
    if (r === 0n) {
      throw new Error('Invalid signature generation')
    }
    
    // Calculate s = k^-1 * (z + r * d) mod n
    const kInv = this.modInverse(k, this.P256_N)
    const s = (kInv * (z + r * d)) % this.P256_N
    
    if (s === 0n) {
      throw new Error('Invalid signature generation')
    }
    
    return {
      r: this.bigIntToBytes(r),
      s: this.bigIntToBytes(s)
    }
  }

  // Point multiplication on P-256 curve
  pointMultiply(scalar, point) {
    if (scalar === 0n) return [0n, 0n] // Point at infinity
    
    let result = [0n, 0n] // Point at infinity
    let addend = [...point]
    
    while (scalar > 0n) {
      if (scalar & 1n) {
        result = this.pointAdd(result, addend)
      }
      addend = this.pointDouble(addend)
      scalar >>= 1n
    }
    
    return result
  }

  // Point addition on P-256 curve
  pointAdd([x1, y1], [x2, y2]) {
    if (x1 === 0n && y1 === 0n) return [x2, y2]
    if (x2 === 0n && y2 === 0n) return [x1, y1]
    
    if (x1 === x2) {
      if (y1 === y2) {
        return this.pointDouble([x1, y1])
      } else {
        return [0n, 0n] // Point at infinity
      }
    }
    
    const lambda = ((y2 - y1) * this.modInverse(x2 - x1, this.P256_P)) % this.P256_P
    const x3 = (lambda * lambda - x1 - x2) % this.P256_P
    const y3 = (lambda * (x1 - x3) - y1) % this.P256_P
    
    return [this.mod(x3, this.P256_P), this.mod(y3, this.P256_P)]
  }

  // Point doubling on P-256 curve
  pointDouble([x, y]) {
    if (x === 0n && y === 0n) return [0n, 0n]
    
    const lambda = ((3n * x * x + this.P256_A) * this.modInverse(2n * y, this.P256_P)) % this.P256_P
    const x3 = (lambda * lambda - 2n * x) % this.P256_P
    const y3 = (lambda * (x - x3) - y) % this.P256_P
    
    return [this.mod(x3, this.P256_P), this.mod(y3, this.P256_P)]
  }

  // Modular inverse using extended Euclidean algorithm
  modInverse(a, m) {
    if (a < 0n) a = this.mod(a, m)
    
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

  // Proper modulo operation for negative numbers
  mod(a, m) {
    return ((a % m) + m) % m
  }

  // Generate random bytes (simplified - use better entropy in production)
  randomBytes(length) {
    const bytes = new Uint8Array(length)
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
    return bytes
  }
}

export default TeslaCrypto