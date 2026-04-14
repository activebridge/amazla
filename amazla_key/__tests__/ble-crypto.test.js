import bleCryptoSession, {
  hexToBytes,
  bytesToHex,
  bytesToBinaryString,
} from '../app-side/ble-crypto.js'

import { decodeMessage } from '../lib/tesla-ble/protocol/protobuf.js'

// Pre-computed test key (P-256, uncompressed)
const TEST_PUBLIC_KEY_HEX = '042a5cee5e1a40fcd2e695cdd00cf6a36755290fc8fe1c956d51ce3450a83f55166c8d9255eb99fdcf99a28f1f96abae79b33b38242e243944a8e88b0cf29e2f7e'
const TEST_PUBLIC_KEY_BINARY = bytesToBinaryString(hexToBytes(TEST_PUBLIC_KEY_HEX))

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
      const result = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY_BINARY)

      expect(result.success).toBe(true)
      expect(result.message).toBeDefined()
      expect(typeof result.message).toBe('string')
      expect(result.message.length).toBeGreaterThan(50)
    })

    test('message does not include length prefix (added by BLE send)', () => {
      const result = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY_BINARY)
      const messageBytes = new Uint8Array(result.message.length)
      for (let i = 0; i < result.message.length; i++) {
        messageBytes[i] = result.message.charCodeAt(i)
      }

      // Message should NOT have length prefix - that's added by teslaBLE.send()
      // Message is ToVCSECMessage { signedMessage (field 1, wire type 2) }
      // First byte = (1 << 3) | 2 = 0x0A
      expect(messageBytes[0]).toBe(0x0A)
    })

    test('uses SIGNATURE_TYPE_PRESENT_KEY (no routing address needed)', () => {
      const result = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY_BINARY)
      const messageBytes = new Uint8Array(result.message.length)
      for (let i = 0; i < result.message.length; i++) {
        messageBytes[i] = result.message.charCodeAt(i)
      }

      const toVcsec = decodeMessage(messageBytes)
      const signedMsg = decodeMessage(toVcsec[1])
      expect(signedMsg[3]).toBe(2) // SIGNATURE_TYPE_PRESENT_KEY = 2
    })

    test('internal structure: ToVCSECMessage > SignedMessage(f2/f3) > UnsignedMessage > WhitelistOp(f5) > PermissionChange(keyRole=OWNER)', async () => {
      const { decodeMessage } = await import('../lib/tesla-ble/protocol/protobuf.js')

      const result = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY_BINARY)
      const messageBytes = new Uint8Array(result.message.length)
      for (let i = 0; i < result.message.length; i++) {
        messageBytes[i] = result.message.charCodeAt(i)
      }

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
      const result = bleCryptoSession.buildWhitelistQueryMessage(TEST_PUBLIC_KEY_BINARY)

      expect(result.success).toBe(true)
      expect(result.message).toBeDefined()
      expect(typeof result.message).toBe('string')
    })
  })

  describe('buildDoublingsTable', () => {
    test('returns ArrayBuffer of correct size (256 × 16 uint32s = 16384 bytes)', () => {
      const result = bleCryptoSession.buildDoublingsTable(TEST_PUBLIC_KEY_BINARY)
      expect(result.success).toBe(true)
      expect(result.buffer.byteLength).toBe(16384)
    })

    test('accepts 65-byte binary string, not hex', () => {
      expect(bleCryptoSession.buildDoublingsTable(TEST_PUBLIC_KEY_BINARY).success).toBe(true)
      expect(bleCryptoSession.buildDoublingsTable(TEST_PUBLIC_KEY_HEX).success).toBe(false)
    })

    test('entry 0 encodes vehicle key x and y in LSW-first Uint32Array format', () => {
      const result = bleCryptoSession.buildDoublingsTable(TEST_PUBLIC_KEY_BINARY)
      const table = new Uint32Array(result.buffer)

      // Reconstruct x and y from LSW-first uint32s and compare to original key bytes
      const keyBytes = hexToBytes(TEST_PUBLIC_KEY_HEX)
      const xBytes = new Uint8Array(32)
      const yBytes = new Uint8Array(32)
      for (let j = 0; j < 8; j++) {
        const w = table[j]
        const idx = 28 - j * 4
        xBytes[idx]   = (w >>> 24) & 0xff; xBytes[idx+1] = (w >>> 16) & 0xff
        xBytes[idx+2] = (w >>> 8)  & 0xff; xBytes[idx+3] = w & 0xff
        const wy = table[8 + j]
        yBytes[idx]   = (wy >>> 24) & 0xff; yBytes[idx+1] = (wy >>> 16) & 0xff
        yBytes[idx+2] = (wy >>> 8)  & 0xff; yBytes[idx+3] = wy & 0xff
      }
      for (let i = 0; i < 32; i++) {
        expect(xBytes[i]).toBe(keyBytes[1 + i])
        expect(yBytes[i]).toBe(keyBytes[33 + i])
      }
    })

    test('all 256 entries are distinct (no repeated points)', () => {
      const result = bleCryptoSession.buildDoublingsTable(TEST_PUBLIC_KEY_BINARY)
      const table = new Uint32Array(result.buffer)
      const seen = new Set()
      for (let i = 0; i < 256; i++) {
        // Use first 4 uint32s of each entry x as fingerprint
        const key = Array.from(table.subarray(i * 16, i * 16 + 4)).join(',')
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
    })

    test('deterministic — same key produces same buffer', () => {
      const r1 = bleCryptoSession.buildDoublingsTable(TEST_PUBLIC_KEY_BINARY)
      const r2 = bleCryptoSession.buildDoublingsTable(TEST_PUBLIC_KEY_BINARY)
      expect(new Uint8Array(r1.buffer)).toEqual(new Uint8Array(r2.buffer))
    })

    test('different vehicle keys produce different tables', () => {
      // Flip one coordinate byte to get a different (invalid but distinct) point
      const altBytes = hexToBytes(TEST_PUBLIC_KEY_HEX)
      altBytes[2] ^= 0xff
      const altKey = bytesToBinaryString(altBytes)
      const r1 = bleCryptoSession.buildDoublingsTable(TEST_PUBLIC_KEY_BINARY)
      const r2 = bleCryptoSession.buildDoublingsTable(altKey)
      // At least entry 0 x-bytes must differ
      expect(new Uint8Array(r1.buffer, 0, 32)).not.toEqual(new Uint8Array(r2.buffer, 0, 32))
    })

    test('invalid key length returns error', () => {
      const result = bleCryptoSession.buildDoublingsTable(bytesToBinaryString(new Uint8Array(32)))
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    test('each entry is 64 bytes: 32-byte x then 32-byte y (big-endian)', () => {
      const result = bleCryptoSession.buildDoublingsTable(TEST_PUBLIC_KEY_BINARY)
      // Verify non-zero x and y for all entries (no point-at-infinity)
      const bytes = new Uint8Array(result.buffer)
      for (let i = 0; i < 256; i++) {
        const xSlice = bytes.subarray(i * 64, i * 64 + 32)
        const ySlice = bytes.subarray(i * 64 + 32, i * 64 + 64)
        const xAllZero = xSlice.every(b => b === 0)
        const yAllZero = ySlice.every(b => b === 0)
        expect(xAllZero).toBe(false)
        expect(yAllZero).toBe(false)
      }
    })
  })

  describe('generateEnrolledKeyPair', () => {
    test('returns success with publicKeyBinary and privateKeyBinary', () => {
      const result = bleCryptoSession.generateEnrolledKeyPair()
      expect(result.success).toBe(true)
      expect(typeof result.publicKeyBinary).toBe('string')
      expect(typeof result.privateKeyBinary).toBe('string')
    })

    test('publicKeyBinary is 65 bytes', () => {
      const result = bleCryptoSession.generateEnrolledKeyPair()
      expect(result.publicKeyBinary.length).toBe(65)
    })

    test('privateKeyBinary is 32 bytes', () => {
      const result = bleCryptoSession.generateEnrolledKeyPair()
      expect(result.privateKeyBinary.length).toBe(32)
    })

    test('public key starts with 0x04 (uncompressed point)', () => {
      const result = bleCryptoSession.generateEnrolledKeyPair()
      expect(result.publicKeyBinary.charCodeAt(0)).toBe(0x04)
    })

    test('private key is non-zero', () => {
      const result = bleCryptoSession.generateEnrolledKeyPair()
      const allZero = Array.from({ length: 32 }, (_, i) => result.privateKeyBinary.charCodeAt(i)).every(b => b === 0)
      expect(allZero).toBe(false)
    })

    test('successive calls produce different keypairs', () => {
      const r1 = bleCryptoSession.generateEnrolledKeyPair()
      const r2 = bleCryptoSession.generateEnrolledKeyPair()
      expect(r1.privateKeyBinary).not.toBe(r2.privateKeyBinary)
      expect(r1.publicKeyBinary).not.toBe(r2.publicKeyBinary)
    })

    test('public key can be fed into buildDoublingsTable', () => {
      const result = bleCryptoSession.generateEnrolledKeyPair()
      const tableResult = bleCryptoSession.buildDoublingsTable(result.publicKeyBinary)
      expect(tableResult.success).toBe(true)
      expect(tableResult.buffer.byteLength).toBe(16384)
    })
  })

  describe('generateKeyPool', () => {
    test('default count produces 5 keys (5 × 97 bytes)', () => {
      const result = bleCryptoSession.generateKeyPool()
      expect(result.success).toBe(true)
      expect(result.pool.length).toBe(5 * 97)
    })

    test('custom count produces N × 97 bytes', () => {
      for (const n of [1, 3, 10]) {
        const result = bleCryptoSession.generateKeyPool(n)
        expect(result.pool.length).toBe(n * 97)
      }
    })

    test('pool is a binary string', () => {
      const result = bleCryptoSession.generateKeyPool(1)
      expect(typeof result.pool).toBe('string')
    })

    test('each key slot: 32-byte private then 65-byte public starting with 0x04', () => {
      const n = 5
      const result = bleCryptoSession.generateKeyPool(n)
      for (let i = 0; i < n; i++) {
        const pubOffset = i * 97 + 32
        expect(result.pool.charCodeAt(pubOffset)).toBe(0x04)
      }
    })

    test('each private key slot is non-zero', () => {
      const n = 3
      const result = bleCryptoSession.generateKeyPool(n)
      for (let i = 0; i < n; i++) {
        const privBytes = Array.from({ length: 32 }, (_, j) => result.pool.charCodeAt(i * 97 + j))
        expect(privBytes.every(b => b === 0)).toBe(false)
      }
    })

    test('successive calls produce different pools', () => {
      const r1 = bleCryptoSession.generateKeyPool(3)
      const r2 = bleCryptoSession.generateKeyPool(3)
      expect(r1.pool).not.toBe(r2.pool)
    })

    test('all public keys in pool can be fed into buildDoublingsTable', () => {
      const n = 2
      const result = bleCryptoSession.generateKeyPool(n)
      for (let i = 0; i < n; i++) {
        const pubBinary = result.pool.slice(i * 97 + 32, i * 97 + 97)
        const tableResult = bleCryptoSession.buildDoublingsTable(pubBinary)
        expect(tableResult.success).toBe(true)
      }
    })
  })
})
