// Tesla BLE Key Management
// Handles storage and retrieval of Tesla private/public keys

import { hexToBytes, bytesToHex } from './crypto/hmac.js'
import { getPublicKey } from './crypto/p256.js'
import { sha1 } from './crypto/sha256.js'

// Storage key names
const PRIVATE_KEY_STORAGE = 'tesla_ble_private_key'
const PUBLIC_KEY_STORAGE = 'tesla_ble_public_key'

class TeslaKeyManager {
  constructor() {
    this.storage = null
    this.privateKey = null
    this.publicKey = null
  }

  // Initialize with settings storage
  init(settingsStorage) {
    this.storage = settingsStorage
    this.load()
  }

  // Load keys from storage
  load() {
    if (!this.storage) return false

    const privateKeyHex = this.storage.getItem(PRIVATE_KEY_STORAGE)
    const publicKeyHex = this.storage.getItem(PUBLIC_KEY_STORAGE)

    if (privateKeyHex && publicKeyHex) {
      try {
        this.privateKey = hexToBytes(privateKeyHex)
        this.publicKey = hexToBytes(publicKeyHex)
        return true
      } catch (e) {
        console.log('Failed to load keys:', e)
        return false
      }
    }

    return false
  }

  // Save keys to storage
  save() {
    if (!this.storage || !this.privateKey) return false

    try {
      this.storage.setItem(PRIVATE_KEY_STORAGE, bytesToHex(this.privateKey))
      this.storage.setItem(PUBLIC_KEY_STORAGE, bytesToHex(this.publicKey))
      return true
    } catch (e) {
      console.log('Failed to save keys:', e)
      return false
    }
  }

  // Set keys from hex strings
  setKeysHex(privateKeyHex, publicKeyHex) {
    try {
      this.privateKey = hexToBytes(privateKeyHex)

      if (publicKeyHex) {
        this.publicKey = hexToBytes(publicKeyHex)
      } else {
        // Derive public key from private
        this.publicKey = getPublicKey(this.privateKey)
      }

      this.save()
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // Set keys from raw bytes
  setKeys(privateKeyBytes, publicKeyBytes) {
    this.privateKey = privateKeyBytes

    if (publicKeyBytes) {
      this.publicKey = publicKeyBytes
    } else {
      this.publicKey = getPublicKey(this.privateKey)
    }

    this.save()
    return { success: true }
  }

  // Import from PEM format
  importFromPEM(pemString) {
    try {
      // Remove PEM headers and whitespace
      const base64 = pemString
        .replace(/-----BEGIN.*?-----/g, '')
        .replace(/-----END.*?-----/g, '')
        .replace(/\s/g, '')

      // Decode base64
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }

      // Extract private key from DER
      // For P-256, private key is 32 bytes
      // Look for the key in the DER structure
      let privateKey = null

      // Simple extraction: look for 32-byte sequences after specific tags
      for (let i = 0; i < bytes.length - 32; i++) {
        // Look for OCTET STRING tag (0x04) followed by length 0x20 (32)
        if (bytes[i] === 0x04 && bytes[i + 1] === 0x20) {
          const candidate = bytes.slice(i + 2, i + 34)

          // Validate it looks like a key (not all zeros or all FF)
          const sum = candidate.reduce((a, b) => a + b, 0)
          if (sum > 0 && sum < 32 * 255) {
            privateKey = candidate
            break
          }
        }
      }

      if (!privateKey) {
        // Fallback: last 32 bytes
        privateKey = bytes.slice(-32)
      }

      this.privateKey = privateKey
      this.publicKey = getPublicKey(privateKey)
      this.save()

      return { success: true, fingerprint: this.getFingerprint() }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // Get key fingerprint (first 8 hex chars of SHA1 of public key)
  getFingerprint() {
    if (!this.publicKey) return null
    const hash = sha1(this.publicKey)
    return bytesToHex(hash.slice(0, 4))
  }

  // Get key ID (first 4 bytes of SHA1 of public key)
  getKeyId() {
    if (!this.publicKey) return null
    const hash = sha1(this.publicKey)
    return hash.slice(0, 4)
  }

  // Check if keys are loaded
  hasKeys() {
    return this.privateKey !== null && this.publicKey !== null
  }

  // Get private key bytes
  getPrivateKey() {
    return this.privateKey
  }

  // Get public key bytes
  getPublicKey() {
    return this.publicKey
  }

  // Get private key as hex
  getPrivateKeyHex() {
    return this.privateKey ? bytesToHex(this.privateKey) : null
  }

  // Get public key as hex
  getPublicKeyHex() {
    return this.publicKey ? bytesToHex(this.publicKey) : null
  }

  // Clear keys
  clear() {
    this.privateKey = null
    this.publicKey = null

    if (this.storage) {
      this.storage.removeItem(PRIVATE_KEY_STORAGE)
      this.storage.removeItem(PUBLIC_KEY_STORAGE)
    }
  }

  // Get status
  getStatus() {
    return {
      hasKeys: this.hasKeys(),
      fingerprint: this.getFingerprint()
    }
  }
}

// Singleton
const teslaKeyManager = new TeslaKeyManager()

export default teslaKeyManager
