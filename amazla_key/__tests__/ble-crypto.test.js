import bleCryptoSession, {
  hexToBytes,
  bytesToHex,
} from '../app-side/ble-crypto.js'

import { decodeMessage } from '../lib/tesla-ble/protocol/protobuf.js'

// Pre-computed test key (P-256, uncompressed)
const TEST_PUBLIC_KEY_HEX = '042a5cee5e1a40fcd2e695cdd00cf6a36755290fc8fe1c956d51ce3450a83f55166c8d9255eb99fdcf99a28f1f96abae79b33b38242e243944a8e88b0cf29e2f7e'

describe('BLE Crypto Helpers', () => {
  describe('hexToBytes', () => {
    test('converts hex string to bytes', () => {
      expect(Array.from(hexToBytes('00'))).toEqual([0])
      expect(Array.from(hexToBytes('ff'))).toEqual([255])
      expect(Array.from(hexToBytes('0102030405'))).toEqual([1, 2, 3, 4, 5])
      expect(Array.from(hexToBytes('deadbeef'))).toEqual([0xde, 0xad, 0xbe, 0xef])
    })

    test('handles uppercase hex', () => {
      expect(Array.from(hexToBytes('DEADBEEF'))).toEqual([0xde, 0xad, 0xbe, 0xef])
    })

    test('converts empty string to empty array', () => {
      expect(Array.from(hexToBytes(''))).toEqual([])
    })
  })

  describe('bytesToHex', () => {
    test('converts bytes to hex string', () => {
      expect(bytesToHex(new Uint8Array([0]))).toBe('00')
      expect(bytesToHex(new Uint8Array([255]))).toBe('ff')
      expect(bytesToHex(new Uint8Array([1, 2, 3, 4, 5]))).toBe('0102030405')
      expect(bytesToHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe('deadbeef')
    })

    test('converts empty array to empty string', () => {
      expect(bytesToHex(new Uint8Array([]))).toBe('')
    })

    test('roundtrip hex conversion', () => {
      const testCases = ['00', 'ff', '0102030405', 'deadbeefcafe']
      for (const hex of testCases) {
        expect(bytesToHex(hexToBytes(hex))).toBe(hex)
      }
    })
  })
})

describe('BLECryptoSession', () => {
  describe('buildPairMessage', () => {
    test('builds valid pairing message', () => {
      const result = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY_HEX)

      expect(result.success).toBe(true)
      expect(result.messageHex).toBeDefined()
      expect(typeof result.messageHex).toBe('string')
      expect(result.messageHex.length).toBeGreaterThan(100)
    })

    test('message does not include length prefix (added by BLE send)', () => {
      const result = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY_HEX)
      const messageBytes = hexToBytes(result.messageHex)

      // Message should NOT have length prefix - that's added by teslaBLE.send()
      // Message is ToVCSECMessage { signedMessage (field 1, wire type 2) }
      // First byte = (1 << 3) | 2 = 0x0A
      expect(messageBytes[0]).toBe(0x0A)
    })

    test('uses SIGNATURE_TYPE_PRESENT_KEY (no routing address needed)', () => {
      const result = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY_HEX)
      const messageBytes = hexToBytes(result.messageHex)

      const toVcsec = decodeMessage(messageBytes)
      const signedMsg = decodeMessage(toVcsec[1])
      expect(signedMsg[3]).toBe(2) // SIGNATURE_TYPE_PRESENT_KEY = 2
    })

    test('internal structure: ToVCSECMessage > SignedMessage(f2/f3) > UnsignedMessage > WhitelistOp(f5) > PermissionChange(keyRole=OWNER)', async () => {
      const { decodeMessage } = await import('../lib/tesla-ble/protocol/protobuf.js')

      const result = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY_HEX)
      const messageBytes = hexToBytes(result.messageHex)

      // ToVCSECMessage { field 1 = SignedMessage }
      const toVcsec = decodeMessage(messageBytes)
      expect(toVcsec[1]).toBeDefined()

      // SignedMessage: payload at field 2, signatureType at field 3 (PRESENT_KEY=2)
      const signedMsg = decodeMessage(toVcsec[1])
      expect(signedMsg[2]).toBeDefined()  // payload field 2
      expect(signedMsg[3]).toBe(2)        // SIGNATURE_TYPE_PRESENT_KEY = 2
      expect(signedMsg[1]).toBeUndefined() // NOT field 1 (old/wrong encoding)

      // UnsignedMessage { field 16 = WhitelistOperation }
      const unsignedMsg = decodeMessage(signedMsg[2])
      expect(unsignedMsg[16]).toBeDefined()

      // WhitelistOperation { field 5 = addKeyToWhitelistAndAddPermissions, field 6 = metadataForKey }
      const whitelistOp = decodeMessage(unsignedMsg[16])
      expect(whitelistOp[5]).toBeDefined()    // addKeyToWhitelistAndAddPermissions
      expect(whitelistOp[6]).toBeDefined()    // metadataForKey (field 6)
      expect(whitelistOp[16]).toBeUndefined() // field 16 = removeAllImpermanentKeys (bool), must be absent
      expect(whitelistOp[1]).toBeUndefined()  // old addPublicKeyToWhitelist field must be absent

      // PermissionChange { field 1 = PublicKey, field 4 = keyRole = ROLE_OWNER(2) }
      const permChange = decodeMessage(whitelistOp[5])
      expect(permChange[1]).toBeDefined()
      expect(permChange[4]).toBe(2) // ROLE_OWNER = 2 (keys.proto: ROLE_SERVICE=1, ROLE_OWNER=2, ROLE_DRIVER=3)

      // PublicKey { field 1 = PublicKeyRaw (65 bytes) }
      const publicKeyMsg = decodeMessage(permChange[1])
      expect(publicKeyMsg[1].length).toBe(65)

      // metadataForKey { field 1 = keyFormFactor }
      const metadata = decodeMessage(whitelistOp[6])
      expect(metadata[1]).toBeDefined()
    })
  })

  describe('buildWhitelistQueryMessage', () => {
    test('builds valid whitelist query message', () => {
      const result = bleCryptoSession.buildWhitelistQueryMessage(TEST_PUBLIC_KEY_HEX)

      expect(result.success).toBe(true)
      expect(result.messageHex).toBeDefined()
      expect(typeof result.messageHex).toBe('string')
    })
  })
})
