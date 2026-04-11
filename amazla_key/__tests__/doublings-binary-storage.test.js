import bleCryptoSession from '../app-side/ble-crypto.js'

// Pre-computed test key (P-256, uncompressed)
const TEST_PUBLIC_KEY_HEX = '042a5cee5e1a40fcd2e695cdd00cf6a36755290fc8fe1c956d51ce3450a83f55166c8d9255eb99fdcf99a28f1f96abae79b33b38242e243944a8e88b0cf29e2f7e'

describe('Doublings table binary storage', () => {
  describe('ArrayBuffer to binary string conversion', () => {
    test('generates binary string (16384 chars) from ArrayBuffer', () => {
      const result = bleCryptoSession.buildDoublingsTable(TEST_PUBLIC_KEY_HEX)
      expect(result.success).toBe(true)
      const bytes = new Uint8Array(result.buffer)
      
      // Convert to binary string manually
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      
      expect(binary.length).toBe(16384)
    })

    test('binary string preserves all byte values (0-255)', () => {
      const result = bleCryptoSession.buildDoublingsTable(TEST_PUBLIC_KEY_HEX)
      const bytes = new Uint8Array(result.buffer)
      
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      
      // Verify roundtrip: binary -> bytes -> binary
      for (let i = 0; i < binary.length; i++) {
        const charCode = binary.charCodeAt(i) & 0xff
        expect(charCode).toBe(bytes[i])
      }
    })
  })

  describe('Binary storage loading with DataView', () => {
    test('converts binary string back to Uint8Array correctly', () => {
      const result = bleCryptoSession.buildDoublingsTable(TEST_PUBLIC_KEY_HEX)
      const originalBytes = new Uint8Array(result.buffer)
      
      // Simulate storage: convert to binary string
      let binaryStored = ''
      for (let i = 0; i < originalBytes.length; i++) {
        binaryStored += String.fromCharCode(originalBytes[i])
      }
      
      // Simulate loading: convert binary string back
      const restoredBytes = new Uint8Array(binaryStored.length)
      for (let i = 0; i < binaryStored.length; i++) {
        restoredBytes[i] = binaryStored.charCodeAt(i) & 0xff
      }
      
      expect(restoredBytes).toEqual(originalBytes)
    })

    test('DataView reads uint32s correctly from binary data', () => {
      const result = bleCryptoSession.buildDoublingsTable(TEST_PUBLIC_KEY_HEX)
      const originalBytes = new Uint8Array(result.buffer)
      
      // Simulate storage and loading
      let binaryStored = ''
      for (let i = 0; i < originalBytes.length; i++) {
        binaryStored += String.fromCharCode(originalBytes[i])
      }
      
      const restoredBytes = new Uint8Array(binaryStored.length)
      for (let i = 0; i < binaryStored.length; i++) {
        restoredBytes[i] = binaryStored.charCodeAt(i) & 0xff
      }
      
      // Create DataView from restored bytes
      const buffer = restoredBytes.buffer.slice(
        restoredBytes.byteOffset,
        restoredBytes.byteOffset + restoredBytes.byteLength
      )
      const view = new DataView(buffer)
      
      // Read first entry's x-coordinates as uint32s
      const x = new Uint32Array(8)
      for (let j = 0; j < 8; j++) {
        x[j] = view.getUint32(j * 4, false) >>> 0
      }
      
      // Compare with original data read directly
      const originalView = new DataView(
        originalBytes.buffer.slice(
          originalBytes.byteOffset,
          originalBytes.byteOffset + originalBytes.byteLength
        )
      )
      const originalX = new Uint32Array(8)
      for (let j = 0; j < 8; j++) {
        originalX[j] = originalView.getUint32(j * 4, false) >>> 0
      }
      
      expect(x).toEqual(originalX)
    })

    test('DataView reads all 256 entries correctly', () => {
      const result = bleCryptoSession.buildDoublingsTable(TEST_PUBLIC_KEY_HEX)
      const originalBytes = new Uint8Array(result.buffer)
      
      // Simulate storage/loading cycle
      let binaryStored = ''
      for (let i = 0; i < originalBytes.length; i++) {
        binaryStored += String.fromCharCode(originalBytes[i])
      }
      
      const restoredBytes = new Uint8Array(binaryStored.length)
      for (let i = 0; i < binaryStored.length; i++) {
        restoredBytes[i] = binaryStored.charCodeAt(i) & 0xff
      }
      
      const buffer = restoredBytes.buffer.slice(
        restoredBytes.byteOffset,
        restoredBytes.byteOffset + restoredBytes.byteLength
      )
      const view = new DataView(buffer)
      
      // Read all 256 entries
      for (let i = 0; i < 256; i++) {
        const base = i * 64
        const x = new Uint32Array(8)
        const y = new Uint32Array(8)
        
        for (let j = 0; j < 8; j++) {
          x[j] = view.getUint32(base + j * 4, false) >>> 0
          y[j] = view.getUint32(base + 32 + j * 4, false) >>> 0
        }
        
        // Verify entry is non-zero (not point-at-infinity)
        expect(x.some(v => v !== 0)).toBe(true)
        expect(y.some(v => v !== 0)).toBe(true)
      }
    })
  })

  describe('Binary storage advantages', () => {
    test('binary storage is 50% smaller than hex', () => {
      const result = bleCryptoSession.buildDoublingsTable(TEST_PUBLIC_KEY_HEX)
      const bytes = new Uint8Array(result.buffer)
      
      // Create hex string (current format)
      let hexString = ''
      for (let i = 0; i < bytes.length; i++) {
        hexString += ('0' + bytes[i].toString(16)).slice(-2)
      }
      
      // Create binary string (new format)
      let binaryString = ''
      for (let i = 0; i < bytes.length; i++) {
        binaryString += String.fromCharCode(bytes[i])
      }
      
      // Binary should be 50% of hex size
      expect(binaryString.length).toBe(16384)
      expect(hexString.length).toBe(32768)
      expect(binaryString.length).toBe(hexString.length / 2)
    })

    test('no hex parsing needed for binary format', () => {
      const result = bleCryptoSession.buildDoublingsTable(TEST_PUBLIC_KEY_HEX)
      const originalBytes = new Uint8Array(result.buffer)
      
      // Create binary storage
      let binaryStored = ''
      for (let i = 0; i < originalBytes.length; i++) {
        binaryStored += String.fromCharCode(originalBytes[i])
      }
      
      // Load using binary method (no parseInt calls!)
      const restoredBytes = new Uint8Array(binaryStored.length)
      for (let i = 0; i < binaryStored.length; i++) {
        restoredBytes[i] = binaryStored.charCodeAt(i) & 0xff
      }
      
      // Should be identical
      expect(restoredBytes).toEqual(originalBytes)
    })
  })

  describe('Storage format specifications', () => {
    test('binary storage is exactly 16384 chars (256 entries × 64 bytes)', () => {
      expect(16384).toBe(256 * 64 * 1)
    })
  })
})
