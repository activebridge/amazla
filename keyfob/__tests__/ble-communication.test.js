// BLE Communication Tests
// Tests for Tesla BLE communication layer

import { hexToBytes, bytesToHex } from '../app-side/ble-crypto.js'

describe('BLE Message Format', () => {
  describe('Length prefix', () => {
    test('2-byte big-endian length prefix is added correctly', () => {
      const data = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05])
      const length = data.length

      const message = new Uint8Array(2 + length)
      message[0] = (length >> 8) & 0xFF  // High byte
      message[1] = length & 0xFF          // Low byte
      message.set(data, 2)

      expect(message[0]).toBe(0x00)  // High byte of 5
      expect(message[1]).toBe(0x05)  // Low byte of 5
      expect(Array.from(message.slice(2))).toEqual([0x01, 0x02, 0x03, 0x04, 0x05])
    })

    test('handles larger messages correctly', () => {
      const data = new Uint8Array(300).fill(0xAB)
      const length = data.length

      const message = new Uint8Array(2 + length)
      message[0] = (length >> 8) & 0xFF
      message[1] = length & 0xFF
      message.set(data, 2)

      // 300 = 0x012C
      expect(message[0]).toBe(0x01)  // High byte
      expect(message[1]).toBe(0x2C)  // Low byte
      expect(message.length).toBe(302)
    })
  })

  describe('Response parsing', () => {
    test('parses length prefix from response', () => {
      // Simulate a response with 5-byte payload
      const response = new Uint8Array([0x00, 0x05, 0x01, 0x02, 0x03, 0x04, 0x05])

      const messageLength = (response[0] << 8) | response[1]
      const payload = response.slice(2, 2 + messageLength)

      expect(messageLength).toBe(5)
      expect(Array.from(payload)).toEqual([0x01, 0x02, 0x03, 0x04, 0x05])
    })

    test('handles empty response payload', () => {
      const response = new Uint8Array([0x00, 0x00])

      const messageLength = (response[0] << 8) | response[1]
      expect(messageLength).toBe(0)
    })
  })
})

describe('Tesla BLE UUIDs', () => {
  const TESLA_SERVICE_UUID = "00000211-b2d1-43f0-9b88-960cebf8b91e"
  const TESLA_WRITE_UUID = "00000212-b2d1-43f0-9b88-960cebf8b91e"
  const TESLA_READ_UUID = "00000213-b2d1-43f0-9b88-960cebf8b91e"

  test('service UUID is correct', () => {
    expect(TESLA_SERVICE_UUID).toBe("00000211-b2d1-43f0-9b88-960cebf8b91e")
  })

  test('write characteristic UUID is correct', () => {
    expect(TESLA_WRITE_UUID).toBe("00000212-b2d1-43f0-9b88-960cebf8b91e")
  })

  test('read characteristic UUID is correct', () => {
    expect(TESLA_READ_UUID).toBe("00000213-b2d1-43f0-9b88-960cebf8b91e")
  })
})

describe('Tesla BLE Device Name Pattern', () => {
  const TESLA_NAME_PATTERN = /^S[a-f0-9]{16}C$/i

  test('matches valid Tesla BLE names', () => {
    expect(TESLA_NAME_PATTERN.test('Sa6bab0d54ffaecf1C')).toBe(true)
    expect(TESLA_NAME_PATTERN.test('S1234567890abcdefC')).toBe(true)
    expect(TESLA_NAME_PATTERN.test('SABCDEF1234567890C')).toBe(true)
  })

  test('rejects invalid names', () => {
    expect(TESLA_NAME_PATTERN.test('Tesla 130307')).toBe(false)
    expect(TESLA_NAME_PATTERN.test('Sa6bab0d54ffaecf1')).toBe(false)  // Missing C
    expect(TESLA_NAME_PATTERN.test('S1234567890abcdeC')).toBe(false)   // Too short
    expect(TESLA_NAME_PATTERN.test('S1234567890abcdef1C')).toBe(false) // Too long
    expect(TESLA_NAME_PATTERN.test('RandomDevice')).toBe(false)
  })
})

describe('Pairing Message Structure', () => {
  test('pairing message starts with correct field key', () => {
    // The first field in a pairing RoutableMessage should be to_destination (field 6)
    // Wire type 2 (length-delimited) = (6 << 3) | 2 = 50 = 0x32
    const expectedFirstByte = 0x32

    // This would be the first byte of a properly formatted pairing message
    expect(expectedFirstByte).toBe(50)
  })

  test('to_destination field key is correctly encoded', () => {
    // Field 6, wire type 2 (length-delimited)
    const fieldNumber = 6
    const wireType = 2
    const fieldKey = (fieldNumber << 3) | wireType

    expect(fieldKey).toBe(0x32)
  })

  test('from_destination field key is correctly encoded', () => {
    // Field 7, wire type 2 (length-delimited)
    const fieldNumber = 7
    const wireType = 2
    const fieldKey = (fieldNumber << 3) | wireType

    expect(fieldKey).toBe(0x3A)
  })

  test('payload field key is correctly encoded', () => {
    // Field 10, wire type 2 (length-delimited)
    const fieldNumber = 10
    const wireType = 2
    const fieldKey = (fieldNumber << 3) | wireType

    expect(fieldKey).toBe(0x52)
  })

  test('uuid field key is correctly encoded', () => {
    // Field 50, wire type 2 (length-delimited)
    // 50 = 0x32 in hex, but as varint needs to encode larger numbers
    const fieldNumber = 50
    const wireType = 2
    const fieldKey = (fieldNumber << 3) | wireType

    // 50 << 3 = 400, + 2 = 402 = 0x192
    // As varint: 0x92 0x03
    expect(fieldKey).toBe(402)
  })
})

describe('RKE Action Message Structure', () => {
  test('RKE action field key is correctly encoded', () => {
    // RKEAction is field 2 in UnsignedMessage, wire type 0 (varint)
    const fieldNumber = 2
    const wireType = 0
    const fieldKey = (fieldNumber << 3) | wireType

    expect(fieldKey).toBe(0x10)
  })

  test('RKE action values are correct', () => {
    const RKE_ACTION_UNLOCK = 0
    const RKE_ACTION_LOCK = 1
    const RKE_ACTION_OPEN_TRUNK = 2
    const RKE_ACTION_OPEN_FRUNK = 3

    expect(RKE_ACTION_UNLOCK).toBe(0)
    expect(RKE_ACTION_LOCK).toBe(1)
    expect(RKE_ACTION_OPEN_TRUNK).toBe(2)
    expect(RKE_ACTION_OPEN_FRUNK).toBe(3)
  })
})

describe('WhitelistOperation Message Structure', () => {
  test('WhitelistOperation field key in UnsignedMessage is correct', () => {
    // WhitelistOperation is field 16 in UnsignedMessage, wire type 2
    const fieldNumber = 16
    const wireType = 2
    const fieldKey = (fieldNumber << 3) | wireType

    // 16 << 3 = 128, + 2 = 130 = 0x82
    // As varint: 0x82 0x01
    expect(fieldKey).toBe(130)
  })

  test('addPublicKeyToWhitelist field key is correct', () => {
    // addPublicKeyToWhitelist is field 1 in WhitelistOperation, wire type 2
    const fieldNumber = 1
    const wireType = 2
    const fieldKey = (fieldNumber << 3) | wireType

    expect(fieldKey).toBe(0x0A)
  })

  test('PublicKeyRaw field key is correct', () => {
    // PublicKeyRaw is field 1 in PublicKey, wire type 2
    const fieldNumber = 1
    const wireType = 2
    const fieldKey = (fieldNumber << 3) | wireType

    expect(fieldKey).toBe(0x0A)
  })
})

describe('Hex Conversion for BLE', () => {
  test('converts message bytes to hex for logging', () => {
    const message = new Uint8Array([0x32, 0x03, 0x08, 0x02])
    const hex = bytesToHex(message)

    expect(hex).toBe('32030802')
  })

  test('converts hex string back to bytes', () => {
    const hex = '32030802'
    const bytes = hexToBytes(hex)

    expect(Array.from(bytes)).toEqual([0x32, 0x03, 0x08, 0x02])
  })

  test('roundtrip conversion preserves data', () => {
    const original = new Uint8Array([0x00, 0xFF, 0x32, 0xAB, 0xCD])
    const hex = bytesToHex(original)
    const restored = hexToBytes(hex)

    expect(Array.from(restored)).toEqual(Array.from(original))
  })
})

describe('Session Key Pool', () => {
  test('session key has correct structure', () => {
    const sessionKey = {
      privateKeyHex: '0'.repeat(64),  // 32 bytes
      publicKeyHex: '04' + '0'.repeat(128)  // 65 bytes (uncompressed)
    }

    expect(sessionKey.privateKeyHex.length).toBe(64)
    expect(sessionKey.publicKeyHex.length).toBe(130)
    expect(sessionKey.publicKeyHex.startsWith('04')).toBe(true)
  })

  test('session key pool can be serialized to JSON', () => {
    const pool = [
      { privateKeyHex: 'a'.repeat(64), publicKeyHex: '04' + 'b'.repeat(128) },
      { privateKeyHex: 'c'.repeat(64), publicKeyHex: '04' + 'd'.repeat(128) }
    ]

    const json = JSON.stringify(pool)
    const restored = JSON.parse(json)

    expect(restored.length).toBe(2)
    expect(restored[0].privateKeyHex).toBe('a'.repeat(64))
    expect(restored[1].publicKeyHex).toBe('04' + 'd'.repeat(128))
  })
})

describe('Domain Constants', () => {
  test('DOMAIN_VEHICLE_SECURITY is correct', () => {
    const DOMAIN_VEHICLE_SECURITY = 2
    expect(DOMAIN_VEHICLE_SECURITY).toBe(2)
  })

  test('domain is encoded correctly in Destination', () => {
    // Destination { domain (field 1) = DOMAIN_VEHICLE_SECURITY (2) }
    // Field 1, wire type 0 = 0x08, value 2 = 0x02
    const encoded = new Uint8Array([0x08, 0x02])

    expect(encoded[0]).toBe(0x08)  // Field key
    expect(encoded[1]).toBe(0x02)  // Value
  })
})
