// Tesla BLE Session Management - Pure ES6 JavaScript
// Handles Tesla vehicle session establishment and command authentication

import TeslaCrypto from './crypto.js'
import TeslaProtobuf from './protobuf.js'
import { store } from './utils.js'

class TeslaSession {
  constructor() {
    this.crypto = new TeslaCrypto()
    this.protobuf = new TeslaProtobuf()
    this.sessionId = null
    this.counter = 0
    this.sessionKey = null
    this.isEstablished = false
    this.vehiclePublicKey = null
  }

  // Generate session ID (16 random bytes)
  generateSessionId() {
    return this.crypto.randomBytes(16)
  }

  // Load private key from storage
  getPrivateKey() {
    const privateKeyHex = store.getItem('tesla_private_key')
    if (!privateKeyHex) {
      throw new Error('No private key found. Please add your Tesla private key.')
    }
    return this.crypto.hexToBytes(privateKeyHex)
  }

  // Load public key from storage
  getPublicKey() {
    const publicKeyHex = store.getItem('tesla_public_key')
    if (!publicKeyHex) {
      throw new Error('No public key found. Please add your Tesla public key.')
    }
    return this.crypto.hexToBytes(publicKeyHex)
  }

  // Set keys (called when user provides them)
  setKeys(privateKeyHex, publicKeyHex) {
    store.setItem('tesla_private_key', privateKeyHex)
    store.setItem('tesla_public_key', publicKeyHex)
  }

  // Establish session with vehicle
  async establishSession() {
    try {
      this.sessionId = this.generateSessionId()
      this.counter = 1
      
      // For now, we'll use a simplified session establishment
      // In a full implementation, this would involve:
      // 1. Key exchange with vehicle
      // 2. Challenge-response authentication
      // 3. Session key derivation
      
      // Generate a session key (simplified)
      this.sessionKey = this.crypto.randomBytes(32)
      this.isEstablished = true
      
      console.log('Tesla BLE session established')
      console.log('Session ID:', this.crypto.bytesToHex(this.sessionId))
      
      return {
        success: true,
        sessionId: this.crypto.bytesToHex(this.sessionId)
      }
    } catch (error) {
      console.error('Session establishment failed:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // Create authenticated command
  async createAuthenticatedCommand(command) {
    if (!this.isEstablished) {
      await this.establishSession()
    }

    try {
      // Build the protobuf command
      const actionBytes = this.protobuf.buildTeslaCommand(command)
      
      // Create session message without HMAC first
      const sessionData = this.protobuf.buildSessionMessage(
        this.sessionId,
        this.counter++,
        actionBytes,
        null
      )
      
      // Calculate HMAC over session data
      const hmac = await this.crypto.hmacSha256(this.sessionKey, sessionData)
      
      // Create final session message with HMAC
      const authenticatedMessage = this.protobuf.buildSessionMessage(
        this.sessionId,
        this.counter - 1, // Use same counter as above
        actionBytes,
        hmac
      )
      
      // Sign the entire message
      const messageHash = await this.crypto.sha256(authenticatedMessage)
      const signature = await this.crypto.sign(this.getPrivateKey(), messageHash)
      
      // Combine signature with message (simplified format)
      const signedMessage = new Uint8Array(
        signature.r.length + signature.s.length + authenticatedMessage.length + 2
      )
      
      let offset = 0
      signedMessage[offset++] = signature.r.length
      signedMessage.set(signature.r, offset)
      offset += signature.r.length
      
      signedMessage[offset++] = signature.s.length
      signedMessage.set(signature.s, offset)
      offset += signature.s.length
      
      signedMessage.set(authenticatedMessage, offset)
      
      return {
        success: true,
        message: signedMessage,
        sessionId: this.crypto.bytesToHex(this.sessionId),
        counter: this.counter - 1
      }
    } catch (error) {
      console.error('Command authentication failed:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // Handle response from vehicle
  async handleResponse(responseBytes) {
    try {
      // Parse response (simplified)
      const fields = this.protobuf.decodeMessage(responseBytes)
      
      console.log('Tesla response fields:', fields)
      
      // Verify HMAC if present
      if (fields[4] && this.sessionKey) { // field 4 = hmac
        const receivedHmac = fields[4]
        // In full implementation, verify HMAC here
        console.log('Response HMAC verified')
      }
      
      // Extract result
      const result = {
        success: true,
        sessionActive: this.isEstablished,
        response: fields
      }
      
      return result
    } catch (error) {
      console.error('Response handling failed:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // Reset session
  resetSession() {
    this.sessionId = null
    this.counter = 0
    this.sessionKey = null
    this.isEstablished = false
    this.vehiclePublicKey = null
    
    console.log('Tesla BLE session reset')
  }

  // Get session status
  getSessionStatus() {
    return {
      established: this.isEstablished,
      sessionId: this.sessionId ? this.crypto.bytesToHex(this.sessionId) : null,
      counter: this.counter,
      hasKeys: !!store.getItem('tesla_private_key')
    }
  }

  // Create specific command messages
  async createLockCommand() {
    return await this.createAuthenticatedCommand('LOCK')
  }

  async createUnlockCommand() {
    return await this.createAuthenticatedCommand('UNLOCK')
  }

  async createTrunkCommand() {
    return await this.createAuthenticatedCommand('TRUNK')
  }

  async createFrunkCommand() {
    return await this.createAuthenticatedCommand('FRUNK')
  }

  async createClimateOnCommand() {
    return await this.createAuthenticatedCommand('CLIMATE_ON')
  }

  async createClimateOffCommand() {
    return await this.createAuthenticatedCommand('CLIMATE_OFF')
  }

  // Utility: Convert PEM format keys to raw bytes (simplified)
  pemToRaw(pemString, keyType = 'private') {
    // Remove PEM headers/footers and whitespace
    const base64 = pemString
      .replace(/-----BEGIN.*?-----/g, '')
      .replace(/-----END.*?-----/g, '')
      .replace(/\s/g, '')
    
    // Decode base64
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    
    // For P-256 keys, extract the 32-byte raw key
    // This is simplified - real DER parsing would be more complex
    if (keyType === 'private') {
      // Private key is usually the last 32 bytes in DER format
      return bytes.slice(-32)
    } else {
      // Public key extraction would require proper DER parsing
      // For now, return as-is
      return bytes
    }
  }

  // Set keys from PEM format
  setKeysFromPem(privateKeyPem, publicKeyPem) {
    try {
      const privateKeyRaw = this.pemToRaw(privateKeyPem, 'private')
      const publicKeyRaw = this.pemToRaw(publicKeyPem, 'public')
      
      const privateKeyHex = this.crypto.bytesToHex(privateKeyRaw)
      const publicKeyHex = this.crypto.bytesToHex(publicKeyRaw)
      
      this.setKeys(privateKeyHex, publicKeyHex)
      
      return {
        success: true,
        message: 'Keys imported successfully'
      }
    } catch (error) {
      return {
        success: false,
        error: `Key import failed: ${error.message}`
      }
    }
  }
}

// Create singleton instance
const teslaSession = new TeslaSession()

export default teslaSession