// Tesla Key Management - Pure ES6 JavaScript
// Handles Tesla private/public key storage and management for ZeppOS

import { store } from './utils.js'
import TeslaCrypto from './crypto.js'

class TeslaKeyManager {
  constructor() {
    this.crypto = new TeslaCrypto()
  }

  // Set Tesla keys (hex format)
  setKeys(privateKeyHex, publicKeyHex) {
    try {
      // Validate key formats
      if (!this.isValidPrivateKey(privateKeyHex)) {
        throw new Error('Invalid private key format')
      }
      
      if (!this.isValidPublicKey(publicKeyHex)) {
        throw new Error('Invalid public key format')
      }
      
      // Store keys
      store.setItem('tesla_private_key', privateKeyHex)
      store.setItem('tesla_public_key', publicKeyHex)
      store.setItem('tesla_keys_set', 'true')
      
      console.log('Tesla keys stored successfully')
      return { success: true, message: 'Keys stored successfully' }
    } catch (error) {
      console.error('Key storage failed:', error)
      return { success: false, error: error.message }
    }
  }

  // Import keys from PEM format
  importFromPem(privateKeyPem, publicKeyPem) {
    try {
      const privateKeyHex = this.pemToHex(privateKeyPem, 'private')
      const publicKeyHex = this.pemToHex(publicKeyPem, 'public')
      
      return this.setKeys(privateKeyHex, publicKeyHex)
    } catch (error) {
      return { success: false, error: `PEM import failed: ${error.message}` }
    }
  }

  // Convert PEM to hex (simplified for P-256 keys)
  pemToHex(pemString, keyType) {
    try {
      // Remove PEM headers and whitespace
      const base64Content = pemString
        .replace(/-----BEGIN.*?-----/g, '')
        .replace(/-----END.*?-----/g, '')
        .replace(/\s/g, '')
      
      // Decode base64
      const binaryString = atob(base64Content)
      const bytes = new Uint8Array(binaryString.length)
      
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      
      // Extract raw key from DER format (simplified)
      let rawKey
      if (keyType === 'private') {
        // For P-256 private keys, the raw 32-byte key is typically near the end
        // This is a simplified extraction - proper DER parsing would be more robust
        rawKey = this.extractPrivateKeyFromDer(bytes)
      } else {
        // For public keys, extract the uncompressed point (64 bytes for P-256)
        rawKey = this.extractPublicKeyFromDer(bytes)
      }
      
      return this.crypto.bytesToHex(rawKey)
    } catch (error) {
      throw new Error(`PEM conversion failed: ${error.message}`)
    }
  }

  // Extract private key from DER format (simplified)
  extractPrivateKeyFromDer(derBytes) {
    // Look for the 32-byte private key value in the DER structure
    // P-256 private keys are 32 bytes (256 bits)
    
    // Simple approach: find a 32-byte sequence that looks like a private key
    for (let i = 0; i <= derBytes.length - 32; i++) {
      const candidate = derBytes.slice(i, i + 32)
      
      // Check if this could be a valid private key (not all zeros, not all 0xFF)
      const isNotAllZeros = candidate.some(b => b !== 0)
      const isNotAllOnes = candidate.some(b => b !== 0xFF)
      
      if (isNotAllZeros && isNotAllOnes) {
        // Additional validation: check if it's less than the curve order
        const keyValue = this.crypto.bytesToBigInt(candidate)
        if (keyValue > 0n && keyValue < this.crypto.P256_N) {
          return candidate
        }
      }
    }
    
    throw new Error('Could not extract private key from DER format')
  }

  // Extract public key from DER format (simplified)
  extractPublicKeyFromDer(derBytes) {
    // Look for uncompressed public key (0x04 prefix + 64 bytes)
    for (let i = 0; i < derBytes.length - 64; i++) {
      if (derBytes[i] === 0x04) {
        // Found uncompressed point marker
        const publicKey = derBytes.slice(i + 1, i + 65) // Skip 0x04 prefix
        if (publicKey.length === 64) {
          return publicKey
        }
      }
    }
    
    // Fallback: look for any 64-byte sequence that could be a public key
    for (let i = 0; i <= derBytes.length - 64; i++) {
      const candidate = derBytes.slice(i, i + 64)
      
      // Basic validation: not all zeros or ones
      const isNotAllZeros = candidate.some(b => b !== 0)
      const isNotAllOnes = candidate.some(b => b !== 0xFF)
      
      if (isNotAllZeros && isNotAllOnes) {
        return candidate
      }
    }
    
    throw new Error('Could not extract public key from DER format')
  }

  // Validate private key format (32 bytes for P-256)
  isValidPrivateKey(hexString) {
    if (!hexString || typeof hexString !== 'string') return false
    if (hexString.length !== 64) return false // 32 bytes = 64 hex chars
    if (!/^[0-9a-fA-F]+$/.test(hexString)) return false
    
    // Check if key is in valid range (1 to n-1)
    try {
      const keyValue = BigInt('0x' + hexString)
      return keyValue > 0n && keyValue < this.crypto.P256_N
    } catch {
      return false
    }
  }

  // Validate public key format (64 bytes for uncompressed P-256)
  isValidPublicKey(hexString) {
    if (!hexString || typeof hexString !== 'string') return false
    if (hexString.length !== 128) return false // 64 bytes = 128 hex chars
    if (!/^[0-9a-fA-F]+$/.test(hexString)) return false
    
    // Additional validation could check if point is on curve
    return true
  }

  // Get stored keys
  getKeys() {
    const privateKey = store.getItem('tesla_private_key')
    const publicKey = store.getItem('tesla_public_key')
    const hasKeys = store.getItem('tesla_keys_set') === 'true'
    
    return {
      hasKeys,
      privateKey: privateKey || null,
      publicKey: publicKey || null
    }
  }

  // Check if keys are available
  hasKeys() {
    return store.getItem('tesla_keys_set') === 'true'
  }

  // Get private key bytes
  getPrivateKeyBytes() {
    const hexKey = store.getItem('tesla_private_key')
    if (!hexKey) throw new Error('No private key available')
    return this.crypto.hexToBytes(hexKey)
  }

  // Get public key bytes
  getPublicKeyBytes() {
    const hexKey = store.getItem('tesla_public_key')
    if (!hexKey) throw new Error('No public key available')
    return this.crypto.hexToBytes(hexKey)
  }

  // Clear stored keys
  clearKeys() {
    store.removeItem('tesla_private_key')
    store.removeItem('tesla_public_key')
    store.removeItem('tesla_keys_set')
    
    console.log('Tesla keys cleared')
    return { success: true, message: 'Keys cleared' }
  }

  // Generate key fingerprint for display
  getKeyFingerprint() {
    try {
      const publicKey = store.getItem('tesla_public_key')
      if (!publicKey) return null
      
      // Create a simple fingerprint from the first 8 chars of public key
      return publicKey.substring(0, 8).toUpperCase()
    } catch {
      return null
    }
  }

  // Test key functionality
  async testKeys() {
    try {
      if (!this.hasKeys()) {
        return { success: false, error: 'No keys available' }
      }
      
      const privateKeyBytes = this.getPrivateKeyBytes()
      const testMessage = new Uint8Array([1, 2, 3, 4, 5])
      const messageHash = await this.crypto.sha256(testMessage)
      
      // Try to sign a test message
      const signature = await this.crypto.sign(privateKeyBytes, messageHash)
      
      return {
        success: true,
        message: 'Keys tested successfully',
        fingerprint: this.getKeyFingerprint()
      }
    } catch (error) {
      return {
        success: false,
        error: `Key test failed: ${error.message}`
      }
    }
  }

  // Import keys from various formats
  importKeys(keyData, format = 'pem') {
    try {
      switch (format.toLowerCase()) {
        case 'pem':
          return this.importFromPem(keyData.privateKey, keyData.publicKey)
        
        case 'hex':
          return this.setKeys(keyData.privateKey, keyData.publicKey)
        
        default:
          return { success: false, error: 'Unsupported key format' }
      }
    } catch (error) {
      return { success: false, error: `Key import failed: ${error.message}` }
    }
  }

  // Export keys (for backup purposes)
  exportKeys() {
    const keys = this.getKeys()
    if (!keys.hasKeys) {
      return { success: false, error: 'No keys to export' }
    }
    
    return {
      success: true,
      keys: {
        private: keys.privateKey,
        public: keys.publicKey,
        fingerprint: this.getKeyFingerprint()
      }
    }
  }
}

// Create singleton instance
const teslaKeyManager = new TeslaKeyManager()

export default teslaKeyManager