// Simple UTF-8 decoder for sandboxed environments
function decodeUTF8(bytes) {
  let result = ''
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i])
  }
  return result
}

// Minimal protobuf decoder for Google Authenticator migration format
function decodeProtobuf(bytes) {
  let pos = 0
  const accounts = []

  function readVarint() {
    let result = 0
    let shift = 0
    while (pos < bytes.length) {
      const byte = bytes[pos++]
      result |= (byte & 0x7f) << shift
      if ((byte & 0x80) === 0) break
      shift += 7
    }
    return result
  }

  function readBytes(length) {
    const result = bytes.slice(pos, pos + length)
    pos += length
    return result
  }

  function parseOtpParameters(data) {
    const params = { secret: null, name: '', issuer: '', algorithm: 1, digits: 1, type: 2 }
    let p = 0

    while (p < data.length) {
      const tag = data[p++]
      const fieldNum = tag >> 3
      const wireType = tag & 0x7

      if (wireType === 2) { // Length-delimited
        let len = 0
        let shift = 0
        while (p < data.length) {
          const byte = data[p++]
          len |= (byte & 0x7f) << shift
          if ((byte & 0x80) === 0) break
          shift += 7
        }
        const value = data.slice(p, p + len)
        p += len

        if (fieldNum === 1) params.secret = value
        if (fieldNum === 2) params.name = decodeUTF8(value)
        if (fieldNum === 3) params.issuer = decodeUTF8(value)
      } else if (wireType === 0) { // Varint
        let val = 0
        let shift = 0
        while (p < data.length) {
          const byte = data[p++]
          val |= (byte & 0x7f) << shift
          if ((byte & 0x80) === 0) break
          shift += 7
        }
        if (fieldNum === 4) params.algorithm = val
        if (fieldNum === 5) params.digits = val
        if (fieldNum === 6) params.type = val
      }
    }
    return params
  }

  // Parse MigrationPayload
  while (pos < bytes.length) {
    const tag = bytes[pos++]
    const fieldNum = tag >> 3
    const wireType = tag & 0x7

    if (wireType === 2) { // Length-delimited
      const len = readVarint()
      const data = readBytes(len)

      if (fieldNum === 1) { // otp_parameters
        const params = parseOtpParameters(data)
        if (params.secret) {
          accounts.push(params)
        }
      }
    } else if (wireType === 0) { // Varint
      readVarint() // skip
    }
  }

  return accounts
}

// Base64 decoder (for sandboxed environments without atob)
function base64Decode(str) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
  let output = ''
  str = str.replace(/[^A-Za-z0-9+/=]/g, '')
  for (let i = 0; i < str.length; i += 4) {
    const a = chars.indexOf(str.charAt(i))
    const b = chars.indexOf(str.charAt(i + 1))
    const c = chars.indexOf(str.charAt(i + 2))
    const d = chars.indexOf(str.charAt(i + 3))
    output += String.fromCharCode((a << 2) | (b >> 4))
    if (c !== 64) output += String.fromCharCode(((b & 15) << 4) | (c >> 2))
    if (d !== 64) output += String.fromCharCode(((c & 3) << 6) | d)
  }
  return output
}

// Base32 encoder for TOTP secrets
function base32Encode(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let result = ''
  let bits = 0
  let value = 0

  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 31]
  }

  return result
}

/**
 * Parse Aegis Authenticator JSON export
 * @param {Object} data - Parsed JSON from Aegis export
 * @returns {Array} - Array of account objects
 */
export function parseAegisExport(data) {
  if (!data.db || !data.db.entries) {
    throw new Error('Invalid Aegis export format')
  }

  return data.db.entries.map(entry => ({
    name: entry.name || '',
    issuer: entry.issuer || '',
    secret: entry.info.secret,
    algorithm: (entry.info.algo || 'SHA1').toUpperCase(),
    digits: entry.info.digits || 6,
    type: (entry.type || 'totp').toUpperCase(),
    period: entry.info.period || 30,
  }))
}

/**
 * Parse 2FAS Authenticator JSON export
 * @param {Object} data - Parsed JSON from 2FAS export
 * @returns {Array} - Array of account objects
 */
export function parse2FASExport(data) {
  if (!data.services && !Array.isArray(data)) {
    throw new Error('Invalid 2FAS export format')
  }

  const services = data.services || data
  return services.map(entry => ({
    name: entry.otp?.account || entry.name || '',
    issuer: entry.otp?.issuer || entry.issuer || '',
    secret: entry.secret || entry.otp?.secret,
    algorithm: (entry.otp?.algorithm || 'SHA1').toUpperCase(),
    digits: entry.otp?.digits || 6,
    type: (entry.otp?.tokenType || 'TOTP').toUpperCase(),
    period: entry.otp?.period || 30,
  }))
}

/**
 * Parse andOTP JSON export
 * @param {Array} data - Parsed JSON array from andOTP export
 * @returns {Array} - Array of account objects
 */
export function parseAndOTPExport(data) {
  if (!Array.isArray(data)) {
    throw new Error('Invalid andOTP export format')
  }

  return data.map(entry => ({
    name: entry.label || '',
    issuer: entry.issuer || '',
    secret: entry.secret,
    algorithm: (entry.algorithm || 'SHA1').toUpperCase(),
    digits: entry.digits || 6,
    type: (entry.type || 'totp').toUpperCase(),
    period: entry.period || 30,
  }))
}

/**
 * Parse Raivo OTP JSON export
 * @param {Array} data - Parsed JSON array from Raivo export
 * @returns {Array} - Array of account objects
 */
export function parseRaivoExport(data) {
  if (!Array.isArray(data)) {
    throw new Error('Invalid Raivo export format')
  }

  return data.map(entry => ({
    name: entry.account || '',
    issuer: entry.issuer || '',
    secret: entry.secret,
    algorithm: (entry.algorithm || 'SHA1').toUpperCase(),
    digits: parseInt(entry.digits || '6', 10),
    type: (entry.kind || 'totp').toUpperCase(),
    period: parseInt(entry.timer || '30', 10),
  }))
}

/**
 * Detect and parse JSON export from various authenticators
 * @param {string} jsonString - JSON string from export file
 * @returns {Array} - Array of account objects
 */
export function parseJSONExport(jsonString) {
  const data = JSON.parse(jsonString)

  // Detect format and parse
  if (data.db && data.db.entries) {
    // Aegis format
    return parseAegisExport(data)
  } else if (data.services || (Array.isArray(data) && data[0]?.otp)) {
    // 2FAS format
    return parse2FASExport(data)
  } else if (Array.isArray(data) && data[0]?.secret && data[0]?.label) {
    // andOTP format
    return parseAndOTPExport(data)
  } else if (Array.isArray(data) && data[0]?.secret && data[0]?.account) {
    // Raivo format
    return parseRaivoExport(data)
  } else {
    throw new Error('Unknown JSON export format')
  }
}

/**
 * Parse standard otpauth:// URI
 * @param {string} url - otpauth://totp/Label?secret=...&issuer=...
 * @returns {Object} - Account object with name, issuer, secret, algorithm, digits, type
 */
export function parseOtpauthUrl(url) {
  const match = url.match(/^otpauth:\/\/(totp|hotp)\/(.+)\?(.+)$/)
  if (!match) {
    throw new Error('Invalid otpauth URL format')
  }

  const type = match[1].toUpperCase()
  const labelPart = decodeURIComponent(match[2])
  const paramsPart = match[3]

  // Parse label (can be "issuer:name" or just "name")
  let issuer = ''
  let name = labelPart
  if (labelPart.includes(':')) {
    const colonIndex = labelPart.indexOf(':')
    issuer = labelPart.substring(0, colonIndex)
    name = labelPart.substring(colonIndex + 1)
  }

  // Parse query params
  const params = {}
  paramsPart.split('&').forEach(pair => {
    const [key, value] = pair.split('=')
    params[key.toLowerCase()] = decodeURIComponent(value || '')
  })

  if (!params.secret) {
    throw new Error('Missing secret parameter')
  }

  // Override issuer if provided in params
  if (params.issuer) {
    issuer = params.issuer
  }

  return {
    name: name,
    issuer: issuer,
    secret: params.secret.toUpperCase().replace(/\s/g, ''),
    algorithm: (params.algorithm || 'SHA1').toUpperCase(),
    digits: parseInt(params.digits || '6', 10),
    type: type,
    period: parseInt(params.period || '30', 10),
    counter: parseInt(params.counter || '0', 10),
  }
}

/**
 * Parse Google Authenticator migration URL and extract accounts
 * @param {string} url - otpauth-migration://offline?data=...
 * @returns {Array} - Array of account objects with name, issuer, secret, algorithm, digits, type
 */
export function parseMigrationUrl(url) {
  if (!url.startsWith('otpauth-migration://')) {
    throw new Error(`Not a migration URL: ${url.substring(0, 50)}...`)
  }

  const dataMatch = url.match(/[?&]data=([^&]+)/)
  const b64 = dataMatch ? decodeURIComponent(dataMatch[1]) : null

  if (!b64) {
    throw new Error('No data parameter in URL')
  }

  // Decode base64
  const binary = base64Decode(b64.replace(/-/g, '+').replace(/_/g, '/'))
  const buffer = []
  for (let i = 0; i < binary.length; i++) {
    buffer.push(binary.charCodeAt(i))
  }

  // Parse protobuf
  const parsed = decodeProtobuf(buffer)

  if (parsed.length === 0) {
    throw new Error('No accounts found in QR code')
  }

  // Convert to storable format
  return parsed.map(acc => ({
    name: acc.name,
    issuer: acc.issuer,
    secret: base32Encode(acc.secret),
    algorithm: ['', 'SHA1', 'SHA256', 'SHA512', 'MD5'][acc.algorithm] || 'SHA1',
    digits: acc.digits === 2 ? 8 : 6,
    type: acc.type === 1 ? 'HOTP' : 'TOTP'
  }))
}
