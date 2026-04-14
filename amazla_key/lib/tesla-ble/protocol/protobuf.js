const WIRE_VARINT = 0
const WIRE_64BIT = 1
const WIRE_LENGTH_DELIMITED = 2
const WIRE_32BIT = 5

// Encode a non-negative integer into protobuf varint format (JS Number safe range)
const encodeVarint = (value) => {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new Error('Varint out of range')
  }
  // Fast-path: single byte
  if (value <= 0x7f) return new Uint8Array([value & 0x7f])
  // Fast-path: two bytes (value <= 0x3fff)
  if (value <= 0x3fff) {
    const low = (value % 128) + 0x80
    const high = Math.floor(value / 128)
    return new Uint8Array([low, high])
  }
  // Fallback: up to 8 bytes for safe JS numbers (7 bits per byte -> 56 bits > 53-bit mantissa)
  const tmp = new Uint8Array(9)
  let pos = 0
  while (value > 0x7f) {
    tmp[pos++] = (value % 128) + 0x80
    value = Math.floor(value / 128)
    if (pos > 8) throw new Error('Varint too long')
  }
  tmp[pos++] = value & 0x7f
  return tmp.subarray(0, pos)
}

const decodeVarint = (buffer, offset) => {
  // Fast-path: single-byte
  if (offset < buffer.length) {
    const first = buffer[offset]
    if ((first & 0x80) === 0) return { value: first, bytesRead: 1 }
  }

  let value = 0
  let multiplier = 1
  let pos = offset
  let bytesRead = 0
  while (pos < buffer.length) {
    const byte = buffer[pos++]
    bytesRead++
    value += (byte & 0x7f) * multiplier
    if ((byte & 0x80) === 0) return { value, bytesRead }
    multiplier *= 128
    if (bytesRead > 5) throw new Error('Varint too long')
    if (value > Number.MAX_SAFE_INTEGER) throw new Error('Varint out of range')
  }
  throw new Error('Unexpected end of buffer')
}

const encodeFieldKey = (fieldNumber, wireType) =>
  encodeVarint(fieldNumber * 8 + wireType)

const decodeFieldKey = (buffer, offset) => {
  const { value, bytesRead } = decodeVarint(buffer, offset)
  const fieldNumber = Math.floor(value / 8)
  const wireType = value % 8
  return { fieldNumber, wireType, bytesRead }
}

const encodeBytes = (fieldNumber, data) => {
  const key = encodeFieldKey(fieldNumber, WIRE_LENGTH_DELIMITED)
  const length = encodeVarint(data.length)
  const result = new Uint8Array(key.length + length.length + data.length)
  result.set(key, 0)
  result.set(length, key.length)
  result.set(data, key.length + length.length)
  return result
}

const encodeVarintField = (fieldNumber, value) => {
  const key = encodeFieldKey(fieldNumber, WIRE_VARINT)
  const val = encodeVarint(value)
  const result = new Uint8Array(key.length + val.length)
  result.set(key, 0)
  result.set(val, key.length)
  return result
}

const encodeEnum = (fieldNumber, value) => encodeVarintField(fieldNumber, value)

const encodeFixed32 = (fieldNumber, value) => {
  const key = encodeFieldKey(fieldNumber, WIRE_32BIT)
  const result = new Uint8Array(key.length + 4)
  result.set(key, 0)
  // little-endian 32-bit
  result[key.length] = value & 0xff
  result[key.length + 1] = (value >>> 8) & 0xff
  result[key.length + 2] = (value >>> 16) & 0xff
  result[key.length + 3] = (value >>> 24) & 0xff
  return result
}

const concat = (...arrays) => {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (let i = 0; i < arrays.length; i++) {
    const arr = arrays[i]
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

const decodeMessage = (buffer) => {
  const fields = {}
  let offset = 0
  while (offset < buffer.length) {
    const { fieldNumber, wireType, bytesRead: keyBytes } = decodeFieldKey(buffer, offset)
    offset += keyBytes

    let value
    let valueBytes = 0

    switch (wireType) {
      case WIRE_VARINT: {
        const result = decodeVarint(buffer, offset)
        value = result.value
        valueBytes = result.bytesRead
        break
      }
      case WIRE_64BIT: {
        if (offset + 8 > buffer.length) throw new Error('Unexpected end of buffer')
        value = buffer.subarray(offset, offset + 8)
        valueBytes = 8
        break
      }
      case WIRE_LENGTH_DELIMITED: {
        const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset)
        offset += lenBytes
        if (offset + length > buffer.length) throw new Error('Unexpected end of buffer')
        value = buffer.subarray(offset, offset + length)
        valueBytes = length
        break
      }
      case WIRE_32BIT: {
        if (offset + 4 > buffer.length) throw new Error('Unexpected end of buffer')
        value = buffer.subarray(offset, offset + 4)
        valueBytes = 4
        break
      }
      default:
        throw new Error(`Unknown wire type: ${wireType}`)
    }

    offset += valueBytes

    if (fields[fieldNumber] !== undefined) {
      if (!Array.isArray(fields[fieldNumber])) fields[fieldNumber] = [fields[fieldNumber]]
      fields[fieldNumber].push(value)
    } else {
      fields[fieldNumber] = value
    }
  }
  return fields
}

export {
  WIRE_VARINT,
  WIRE_64BIT,
  WIRE_LENGTH_DELIMITED,
  WIRE_32BIT,
  encodeVarint,
  decodeVarint,
  encodeFieldKey,
  decodeFieldKey,
  encodeBytes,
  encodeVarintField,
  encodeEnum,
  encodeFixed32,
  concat,
  decodeMessage,
}
