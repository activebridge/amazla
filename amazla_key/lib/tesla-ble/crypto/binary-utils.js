// Binary/hex conversion utilities shared across app

function binaryStringToBytes(binary) {
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i) & 0xff
  }
  return bytes
}

function bytesToBinaryString(bytes) {
  const CHUNK = 8192
  if (bytes.length <= CHUNK) return String.fromCharCode.apply(null, bytes)
  let s = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return s
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

// Debug-only hex dump: null-safe ('<null>'), accepts a Uint8Array or ArrayBuffer,
// and takes an optional byte cap that appends a …(+NB) elision marker. This is for
// log/diagnostic output — use bytesToHex for logic paths (it has no null guard).
function hexDump(buf, max) {
  if (!buf) return '<null>'
  const arr = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf
  const cap = max === undefined ? arr.length : Math.min(max, arr.length)
  let s = ''
  for (let i = 0; i < cap; i++) s += (arr[i] & 0xff).toString(16).padStart(2, '0')
  return arr.length > cap ? s + '…(+' + (arr.length - cap) + 'B)' : s
}

export { binaryStringToBytes, bytesToBinaryString, bytesToHex, hexToBytes, hexDump }
