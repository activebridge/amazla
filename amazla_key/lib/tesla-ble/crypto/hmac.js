// HMAC-SHA256 implementation
// Uses our pure JS SHA-256

import { sha256 } from './sha256.js'

const BLOCK_SIZE = 64 // SHA-256 block size in bytes

// HMAC-SHA256
function hmacSha256(key, message) {
  // Convert inputs to Uint8Array
  let keyBytes = toBytes(key)
  const messageBytes = toBytes(message)

  // If key is longer than block size, hash it
  if (keyBytes.length > BLOCK_SIZE) {
    keyBytes = sha256(keyBytes)
  }

  // If key is shorter than block size, pad with zeros
  if (keyBytes.length < BLOCK_SIZE) {
    const padded = new Uint8Array(BLOCK_SIZE)
    padded.set(keyBytes)
    keyBytes = padded
  }

  // Create inner and outer padding
  const innerPad = new Uint8Array(BLOCK_SIZE)
  const outerPad = new Uint8Array(BLOCK_SIZE)

  for (let i = 0; i < BLOCK_SIZE; i++) {
    innerPad[i] = keyBytes[i] ^ 0x36
    outerPad[i] = keyBytes[i] ^ 0x5c
  }

  // Inner hash: H(K XOR ipad || message)
  const innerData = new Uint8Array(BLOCK_SIZE + messageBytes.length)
  innerData.set(innerPad)
  innerData.set(messageBytes, BLOCK_SIZE)
  const innerHash = sha256(innerData)

  // Outer hash: H(K XOR opad || inner_hash)
  const outerData = new Uint8Array(BLOCK_SIZE + 32)
  outerData.set(outerPad)
  outerData.set(innerHash, BLOCK_SIZE)

  return sha256(outerData)
}

// Helper to convert various types to Uint8Array
function toBytes(data) {
  if (data instanceof Uint8Array) {
    return data
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }
  if (typeof data === 'string') {
    const bytes = new Uint8Array(data.length)
    for (let i = 0; i < data.length; i++) {
      bytes[i] = data.charCodeAt(i) & 0xff
    }
    return bytes
  }
  if (Array.isArray(data)) {
    return new Uint8Array(data)
  }
  throw new Error('Invalid input type for HMAC')
}

// Utility functions
function bytesToHex(bytes) {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

function concatBytes(...arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

export { hmacSha256, toBytes, bytesToHex, hexToBytes, concatBytes }
export default hmacSha256
