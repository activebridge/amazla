
const WIRE_VARINT = 0
const WIRE_64BIT = 1
const WIRE_LENGTH_DELIMITED = 2
const WIRE_32BIT = 5
const encodeVarint = (value) => {
  const bytes = []
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80)
    value >>>= 7
  }
  bytes.push(value & 0x7f)
  return new Uint8Array(bytes)
}
const decodeVarint = (buffer, offset) => {
  let value = 0
  let shift = 0
  let pos = offset
  while (pos < buffer.length) {
    const byte = buffer[pos++]
    value |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) return { value, bytesRead: pos - offset }
    shift += 7
    if (shift > 35) throw new Error('Varint too long')
  }
  throw new Error('Unexpected end of buffer')
}
const encodeFieldKey = (fieldNumber, wireType) =>
  encodeVarint((fieldNumber << 3) | wireType)
const decodeFieldKey = (buffer, offset) => {
  const { value, bytesRead } = decodeVarint(buffer, offset)
  return { fieldNumber: value >>> 3, wireType: value & 0x07, bytesRead }
}
const encodeBytes = (fieldNumber, data) => {
  const key = encodeFieldKey(fieldNumber, WIRE_LENGTH_DELIMITED)
  const length = encodeVarint(data.length)
  const result = new Uint8Array(key.length + length.length + data.length)
  result.set(key)
  result.set(length, key.length)
  result.set(data, key.length + length.length)
  return result
}
const encodeVarintField = (fieldNumber, value) => {
  const key = encodeFieldKey(fieldNumber, WIRE_VARINT)
  const val = encodeVarint(value)
  const result = new Uint8Array(key.length + val.length)
  result.set(key)
  result.set(val, key.length)
  return result
}
const encodeEnum = (fieldNumber, value) => encodeVarintField(fieldNumber, value)
const encodeFixed32 = (fieldNumber, value) => {
  const key = encodeFieldKey(fieldNumber, WIRE_32BIT)
  const result = new Uint8Array(key.length + 4)
  result.set(key)
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
  for (const arr of arrays) {
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
        value = buffer.subarray(offset, offset + 8)
        valueBytes = 8
        break
      }
      case WIRE_LENGTH_DELIMITED: {
        const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset)
        offset += lenBytes
        value = buffer.subarray(offset, offset + length)
        valueBytes = length
        break
      }
      case WIRE_32BIT: {
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
