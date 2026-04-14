import {
  decodeVarint,
  decodeMessage,
  encodeFieldKey,
  decodeFieldKey,
  WIRE_64BIT,
  WIRE_32BIT,
  WIRE_VARINT,
} from '../lib/tesla-ble/protocol/protobuf.js'

describe('Protobuf Edge Cases', () => {
  test('decodeVarint throws on too long varint', () => {
    const buf = new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x80])
    expect(() => decodeVarint(buf, 0)).toThrow('Varint too long')
  })

  test('decodeVarint throws on unexpected end of buffer', () => {
    const buf = new Uint8Array([0x80]) // continuation bit but no more bytes
    expect(() => decodeVarint(buf, 0)).toThrow('Unexpected end of buffer')
  })

  test('decodeMessage decodes 64-bit wire type', () => {
    // field 1, wire type 1 => key = 0x09
    const payload = new Uint8Array([1,2,3,4,5,6,7,8])
    const buf = new Uint8Array([0x09, ...payload])
    const decoded = decodeMessage(buf)
    expect(decoded[1]).toBeDefined()
    expect(Array.from(decoded[1])).toEqual(Array.from(payload))
    expect(decoded[1].length).toBe(8)
  })

  test('decodeMessage decodes 32-bit wire type', () => {
    // field 1, wire type 5 => key = 0x0d
    const payload = new Uint8Array([0x10,0x20,0x30,0x40])
    const buf = new Uint8Array([0x0d, ...payload])
    const decoded = decodeMessage(buf)
    expect(decoded[1]).toBeDefined()
    expect(Array.from(decoded[1])).toEqual(Array.from(payload))
    expect(decoded[1].length).toBe(4)
  })

  test('decodeMessage throws on unknown wire type', () => {
    // field 1, wire type 7 (invalid) => key = (1<<3)|7 = 0x0f
    const buf = new Uint8Array([0x0f, 0x00])
    expect(() => decodeMessage(buf)).toThrow('Unknown wire type: 7')
  })

  test('encodeFieldKey/decodeFieldKey roundtrip for large field numbers', () => {
    const bigField = 1048576 // 2^20
    const key = encodeFieldKey(bigField, WIRE_VARINT)
    const decoded = decodeFieldKey(key, 0)
    expect(decoded.fieldNumber).toBe(bigField)
    expect(decoded.wireType).toBe(WIRE_VARINT)
  })
})
