// Minimal Protobuf encoder/decoder for Tesla BLE protocol
// Only implements what's needed for VCSEC messages

// Wire types
const WIRE_VARINT = 0
const WIRE_64BIT = 1
const WIRE_LENGTH_DELIMITED = 2
const WIRE_32BIT = 5

// Encode varint
function encodeVarint(value) {
  const bytes = []
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80)
    value >>>= 7
  }
  bytes.push(value & 0x7f)
  return new Uint8Array(bytes)
}

// Decode varint from buffer at offset
function decodeVarint(buffer, offset) {
  let value = 0
  let shift = 0
  let pos = offset

  while (pos < buffer.length) {
    const byte = buffer[pos++]
    value |= (byte & 0x7f) << shift

    if ((byte & 0x80) === 0) {
      return { value, bytesRead: pos - offset }
    }

    shift += 7
    if (shift > 35) {
      throw new Error('Varint too long')
    }
  }

  throw new Error('Unexpected end of buffer')
}

// Encode field key (field number + wire type)
function encodeFieldKey(fieldNumber, wireType) {
  return encodeVarint((fieldNumber << 3) | wireType)
}

// Decode field key
function decodeFieldKey(buffer, offset) {
  const { value, bytesRead } = decodeVarint(buffer, offset)
  return {
    fieldNumber: value >>> 3,
    wireType: value & 0x07,
    bytesRead
  }
}

// Encode length-delimited field (bytes/string/embedded message)
function encodeBytes(fieldNumber, data) {
  const key = encodeFieldKey(fieldNumber, WIRE_LENGTH_DELIMITED)
  const length = encodeVarint(data.length)
  const result = new Uint8Array(key.length + length.length + data.length)
  result.set(key)
  result.set(length, key.length)
  result.set(data, key.length + length.length)
  return result
}

// Encode varint field
function encodeVarintField(fieldNumber, value) {
  const key = encodeFieldKey(fieldNumber, WIRE_VARINT)
  const val = encodeVarint(value)
  const result = new Uint8Array(key.length + val.length)
  result.set(key)
  result.set(val, key.length)
  return result
}

// Encode enum field (same as varint)
function encodeEnum(fieldNumber, value) {
  return encodeVarintField(fieldNumber, value)
}

// Encode fixed32 field
function encodeFixed32(fieldNumber, value) {
  const key = encodeFieldKey(fieldNumber, WIRE_32BIT)
  const result = new Uint8Array(key.length + 4)
  result.set(key)
  result[key.length] = value & 0xff
  result[key.length + 1] = (value >>> 8) & 0xff
  result[key.length + 2] = (value >>> 16) & 0xff
  result[key.length + 3] = (value >>> 24) & 0xff
  return result
}

// Concatenate multiple encoded fields
function concat(...arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

// Decode message into field map
function decodeMessage(buffer) {
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
        value = buffer.slice(offset, offset + 8)
        valueBytes = 8
        break
      }
      case WIRE_LENGTH_DELIMITED: {
        const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset)
        offset += lenBytes
        value = buffer.slice(offset, offset + length)
        valueBytes = length
        break
      }
      case WIRE_32BIT: {
        value = buffer.slice(offset, offset + 4)
        valueBytes = 4
        break
      }
      default:
        throw new Error(`Unknown wire type: ${wireType}`)
    }

    offset += valueBytes

    // Store field (handle repeated fields)
    if (fields[fieldNumber] !== undefined) {
      if (!Array.isArray(fields[fieldNumber])) {
        fields[fieldNumber] = [fields[fieldNumber]]
      }
      fields[fieldNumber].push(value)
    } else {
      fields[fieldNumber] = value
    }
  }

  return fields
}

export {
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
  WIRE_VARINT,
  WIRE_LENGTH_DELIMITED,
  WIRE_32BIT,
  WIRE_64BIT
}
