
import { sha256 } from './sha256.js'
const BLOCK_SIZE = 64 // SHA-256 block size in bytes
function hmacSha256(key, message) {
  let keyBytes = toBytes(key)
  const messageBytes = toBytes(message)
  if (keyBytes.length > BLOCK_SIZE) {
    keyBytes = sha256(keyBytes)
  }
  if (keyBytes.length < BLOCK_SIZE) {
    const padded = new Uint8Array(BLOCK_SIZE)
    padded.set(keyBytes)
    keyBytes = padded
  }
  const innerPad = new Uint8Array(BLOCK_SIZE)
  const outerPad = new Uint8Array(BLOCK_SIZE)
  for (let i = 0; i < BLOCK_SIZE; i++) {
    innerPad[i] = keyBytes[i] ^ 0x36
    outerPad[i] = keyBytes[i] ^ 0x5c
  }
  const innerData = new Uint8Array(BLOCK_SIZE + messageBytes.length)
  innerData.set(innerPad)
  innerData.set(messageBytes, BLOCK_SIZE)
  const innerHash = sha256(innerData)
  const outerData = new Uint8Array(BLOCK_SIZE + 32)
  outerData.set(outerPad)
  outerData.set(innerHash, BLOCK_SIZE)
  return sha256(outerData)
}
function createKeyedHmac(key) {
  const keyBytes = toBytes(key)
  const paddedKey = new Uint8Array(BLOCK_SIZE)
  if (keyBytes.length > BLOCK_SIZE) paddedKey.set(sha256(keyBytes))
  else paddedKey.set(keyBytes)
  const innerPad = new Uint8Array(BLOCK_SIZE)
  const outerPad = new Uint8Array(BLOCK_SIZE)
  for (let i = 0; i < BLOCK_SIZE; i++) {
    innerPad[i] = paddedKey[i] ^ 0x36
    outerPad[i] = paddedKey[i] ^ 0x5c
  }
  return function(message) {
    const messageBytes = toBytes(message)
    const innerData = new Uint8Array(BLOCK_SIZE + messageBytes.length)
    innerData.set(innerPad)
    innerData.set(messageBytes, BLOCK_SIZE)
    const innerHash = sha256(innerData)
    const outerData = new Uint8Array(BLOCK_SIZE + 32)
    outerData.set(outerPad)
    outerData.set(innerHash, BLOCK_SIZE)
    return sha256(outerData)
  }
}
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
export { hmacSha256, createKeyedHmac, toBytes, bytesToHex, hexToBytes, concatBytes }
export default hmacSha256
