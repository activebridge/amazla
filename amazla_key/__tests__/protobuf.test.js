import {
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
  WIRE_32BIT
} from '../lib/tesla-ble/protocol/protobuf.js'

describe('Protobuf Encoding', () => {
  describe('encodeVarint', () => {
    test('encodes single byte values', () => {
      expect(Array.from(encodeVarint(0))).toEqual([0])
      expect(Array.from(encodeVarint(1))).toEqual([1])
      expect(Array.from(encodeVarint(127))).toEqual([127])
    })

    test('encodes two byte values', () => {
      expect(Array.from(encodeVarint(128))).toEqual([0x80, 0x01])
      expect(Array.from(encodeVarint(300))).toEqual([0xac, 0x02])
    })

    test('encodes larger values', () => {
      expect(Array.from(encodeVarint(16383))).toEqual([0xff, 0x7f])
      expect(Array.from(encodeVarint(16384))).toEqual([0x80, 0x80, 0x01])
    })
  })

  describe('decodeVarint', () => {
    test('decodes single byte values', () => {
      expect(decodeVarint(new Uint8Array([0]), 0)).toEqual({ value: 0, bytesRead: 1 })
      expect(decodeVarint(new Uint8Array([1]), 0)).toEqual({ value: 1, bytesRead: 1 })
      expect(decodeVarint(new Uint8Array([127]), 0)).toEqual({ value: 127, bytesRead: 1 })
    })

    test('decodes two byte values', () => {
      expect(decodeVarint(new Uint8Array([0x80, 0x01]), 0)).toEqual({ value: 128, bytesRead: 2 })
      expect(decodeVarint(new Uint8Array([0xac, 0x02]), 0)).toEqual({ value: 300, bytesRead: 2 })
    })

    test('decodes with offset', () => {
      const buffer = new Uint8Array([0x00, 0x00, 0xac, 0x02])
      expect(decodeVarint(buffer, 2)).toEqual({ value: 300, bytesRead: 2 })
    })

    test('roundtrip encode/decode', () => {
      const values = [0, 1, 127, 128, 255, 300, 16383, 16384, 65535]
      for (const value of values) {
        const encoded = encodeVarint(value)
        const decoded = decodeVarint(encoded, 0)
        expect(decoded.value).toBe(value)
      }
    })
  })

  describe('encodeFieldKey', () => {
    test('encodes field keys correctly', () => {
      // Field 1, wire type 0 (varint) = (1 << 3) | 0 = 8
      expect(Array.from(encodeFieldKey(1, WIRE_VARINT))).toEqual([0x08])

      // Field 1, wire type 2 (length-delimited) = (1 << 3) | 2 = 10
      expect(Array.from(encodeFieldKey(1, WIRE_LENGTH_DELIMITED))).toEqual([0x0a])

      // Field 2, wire type 0 = (2 << 3) | 0 = 16
      expect(Array.from(encodeFieldKey(2, WIRE_VARINT))).toEqual([0x10])
    })
  })

  describe('decodeFieldKey', () => {
    test('decodes field keys correctly', () => {
      expect(decodeFieldKey(new Uint8Array([0x08]), 0)).toEqual({
        fieldNumber: 1,
        wireType: WIRE_VARINT,
        bytesRead: 1
      })

      expect(decodeFieldKey(new Uint8Array([0x0a]), 0)).toEqual({
        fieldNumber: 1,
        wireType: WIRE_LENGTH_DELIMITED,
        bytesRead: 1
      })
    })
  })

  describe('encodeBytes', () => {
    test('encodes bytes field correctly', () => {
      const data = new Uint8Array([0x01, 0x02, 0x03])
      const encoded = encodeBytes(1, data)

      // Field 1, wire type 2 = 0x0a, length = 3, data = [1,2,3]
      expect(Array.from(encoded)).toEqual([0x0a, 0x03, 0x01, 0x02, 0x03])
    })

    test('encodes empty bytes', () => {
      const encoded = encodeBytes(1, new Uint8Array(0))
      expect(Array.from(encoded)).toEqual([0x0a, 0x00])
    })
  })

  describe('encodeVarintField', () => {
    test('encodes varint field correctly', () => {
      const encoded = encodeVarintField(1, 150)
      // Field 1, wire type 0 = 0x08, value 150 = 0x96, 0x01
      expect(Array.from(encoded)).toEqual([0x08, 0x96, 0x01])
    })
  })

  describe('encodeEnum', () => {
    test('encodes enum same as varint', () => {
      const varintEncoded = encodeVarintField(2, 5)
      const enumEncoded = encodeEnum(2, 5)
      expect(Array.from(enumEncoded)).toEqual(Array.from(varintEncoded))
    })
  })

  describe('encodeFixed32', () => {
    test('encodes fixed32 in little-endian', () => {
      const encoded = encodeFixed32(1, 0x12345678)
      // Field 1, wire type 5 = (1 << 3) | 5 = 13 = 0x0d
      // Value in little-endian: 0x78, 0x56, 0x34, 0x12
      expect(Array.from(encoded)).toEqual([0x0d, 0x78, 0x56, 0x34, 0x12])
    })
  })

  describe('concat', () => {
    test('concatenates arrays', () => {
      const a = new Uint8Array([1, 2])
      const b = new Uint8Array([3, 4])
      const c = new Uint8Array([5])
      expect(Array.from(concat(a, b, c))).toEqual([1, 2, 3, 4, 5])
    })

    test('handles empty arrays', () => {
      const a = new Uint8Array([1, 2])
      const b = new Uint8Array(0)
      expect(Array.from(concat(a, b))).toEqual([1, 2])
    })
  })

  describe('decodeMessage', () => {
    test('decodes simple message with varint field', () => {
      // Field 1, varint value 150
      const encoded = new Uint8Array([0x08, 0x96, 0x01])
      const decoded = decodeMessage(encoded)
      expect(decoded[1]).toBe(150)
    })

    test('decodes message with bytes field', () => {
      // Field 1, bytes [1,2,3]
      const encoded = new Uint8Array([0x0a, 0x03, 0x01, 0x02, 0x03])
      const decoded = decodeMessage(encoded)
      expect(Array.from(decoded[1])).toEqual([0x01, 0x02, 0x03])
    })

    test('decodes message with multiple fields', () => {
      const encoded = concat(
        encodeVarintField(1, 100),
        encodeBytes(2, new Uint8Array([0xab, 0xcd])),
        encodeVarintField(3, 200)
      )
      const decoded = decodeMessage(encoded)
      expect(decoded[1]).toBe(100)
      expect(Array.from(decoded[2])).toEqual([0xab, 0xcd])
      expect(decoded[3]).toBe(200)
    })

    test('handles repeated fields as arrays', () => {
      const encoded = concat(
        encodeVarintField(1, 10),
        encodeVarintField(1, 20),
        encodeVarintField(1, 30)
      )
      const decoded = decodeMessage(encoded)
      expect(decoded[1]).toEqual([10, 20, 30])
    })
  })
})
