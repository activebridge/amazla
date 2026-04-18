import { sha256 } from './sha256.js'

const BLOCK_SIZE = 64 // SHA-256 block size in bytes

const buildKeyBlock = (keyBytes) => {
  if (!(keyBytes instanceof Uint8Array)) throw new Error('HMAC key must be a Uint8Array')
  let kb = keyBytes
  if (kb.length > BLOCK_SIZE) kb = sha256(kb)
  if (kb.length < BLOCK_SIZE) {
    const padded = new Uint8Array(BLOCK_SIZE)
    padded.set(kb)
    kb = padded
  }
  return kb
}

const buildPadsFromKeyBytes = (keyBytes) => {
  const innerPad = new Uint8Array(BLOCK_SIZE)
  const outerPad = new Uint8Array(BLOCK_SIZE)
  for (let i = 0; i < BLOCK_SIZE; i++) {
    const k = keyBytes[i]
    innerPad[i] = k ^ 0x36
    outerPad[i] = k ^ 0x5c
  }
  return { innerPad, outerPad }
}

const hmacFromPads = (innerPad, outerPad, messageBytes) => {
  if (!(messageBytes instanceof Uint8Array)) throw new Error('HMAC message must be a Uint8Array')
  const innerData = new Uint8Array(BLOCK_SIZE + messageBytes.length)
  innerData.set(innerPad)
  innerData.set(messageBytes, BLOCK_SIZE)
  const innerHash = sha256(innerData)
  const outerData = new Uint8Array(BLOCK_SIZE + 32)
  outerData.set(outerPad)
  outerData.set(innerHash, BLOCK_SIZE)
  return sha256(outerData)
}

const createHmac = (key) => {
  const keyBytes = buildKeyBlock(key)
  const { innerPad, outerPad } = buildPadsFromKeyBytes(keyBytes)
  const hmac = (message) => hmacFromPads(innerPad, outerPad, message)
  return { hmac, innerPad, outerPad }
}

// Derives session-level and command-level HMAC functions from a 16-byte session key.
// Command sub-key = HMAC-SHA256(sessionKey, "authenticated command") per Tesla SDK.
const CMD_LABEL = new Uint8Array([
  97, 117, 116, 104, 101, 110, 116, 105, 99, 97, 116, 101, 100, 32, 99, 111, 109, 109, 97, 110, 100,
])
// "session info" — label for SessionInfo tag subkey derivation.
const SESSION_INFO_LABEL = new Uint8Array([
  115, 101, 115, 115, 105, 111, 110, 32, 105, 110, 102, 111,
])

const createSessionHmacs = (sessionKey) => {
  const { hmac } = createHmac(sessionKey)
  const subKey = hmac(CMD_LABEL)
  const { hmac: cmdHmac } = createHmac(subKey)
  return { hmac, cmdHmac }
}

const createSessionInfoHmac = (sessionKey) => {
  const { hmac } = createHmac(sessionKey)
  const subKey = hmac(SESSION_INFO_LABEL)
  const { hmac: infoHmac } = createHmac(subKey)
  return infoHmac
}

export { createHmac, createSessionHmacs, createSessionInfoHmac }
