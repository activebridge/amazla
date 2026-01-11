// Tesla BLE Session Management
// Handles ECDH key exchange, session establishment, and command authentication

import { sha1 } from './crypto/sha256.js'
import { hmacSha256, concatBytes, hexToBytes, bytesToHex } from './crypto/hmac.js'
import { generatePrivateKey, getPublicKey, ecdh } from './crypto/p256.js'
import { aesGcmEncrypt, counterToNonce } from './crypto/aes-gcm.js'
import { LocalStorage } from '@zos/storage'
import {
  DOMAIN_VEHICLE_SECURITY,
  SIGNATURE_TYPE_HMAC,
  SIGNATURE_TYPE_AES_GCM,
  buildRoutableMessage,
  buildSessionInfoRequest,
  buildSignedMessage,
  buildToVCSECMessage,
  buildUnsignedMessage,
  buildKeyToAdd,
  buildWhitelistOperation,
  buildUnsignedMessageWithWhitelist,
  parseRoutableMessage,
  generateUUID,
  generateRoutingAddress,
  RKE_ACTION_LOCK,
  RKE_ACTION_UNLOCK,
  RKE_ACTION_OPEN_TRUNK,
  RKE_ACTION_OPEN_FRUNK,
  KEY_ROLE_OWNER,
  KEY_FORM_FACTOR_ANDROID_DEVICE
} from './protocol/vcsec.js'
import teslaBLE from './ble.js'

class TeslaSession {
  constructor() {
    this.reset()
    // Pre-generated keypair cache
    this.pregenPrivateKey = null
    this.pregenPublicKey = null
    this.pregenReady = false
  }

  reset() {
    // Ephemeral key pair for this session
    this.ephemeralPrivateKey = null
    this.ephemeralPublicKey = null

    // Vehicle's session info
    this.vehiclePublicKey = null
    this.epoch = null
    this.counter = 0
    this.clockTime = 0

    // Derived session key
    this.sessionKey = null

    // Routing
    this.routingAddress = null

    // State
    this.established = false
  }

  // Try to load pre-generated keypair from storage (from background service)
  loadPregenFromStorage() {
    if (this.pregenReady) return true

    try {
      const storage = new LocalStorage()
      const privateHex = storage.getItem('tesla_pregen_private')
      const publicHex = storage.getItem('tesla_pregen_public')
      const timestamp = storage.getItem('tesla_pregen_time')

      if (privateHex && publicHex && timestamp) {
        // Check if still valid (1 hour)
        const age = Date.now() - parseInt(timestamp)
        if (age < 60 * 60 * 1000) {
          this.pregenPrivateKey = hexToBytes(privateHex)
          this.pregenPublicKey = hexToBytes(publicHex)
          this.pregenReady = true

          // Clear from storage (single use)
          storage.removeItem('tesla_pregen_private')
          storage.removeItem('tesla_pregen_public')
          storage.removeItem('tesla_pregen_time')

          console.log('[Session] Loaded pre-generated keypair from storage')
          return true
        }
      }
    } catch (e) {
      console.log('[Session] Failed to load pregen:', e.message)
    }

    return false
  }

  // Pre-generate ephemeral keypair in background (call during idle time)
  pregenKeypair() {
    if (this.pregenReady) return  // Already have one
    this.pregenPrivateKey = generatePrivateKey()
    this.pregenPublicKey = getPublicKey(this.pregenPrivateKey)
    this.pregenReady = true
  }

  // Check if pre-generated keypair is available
  hasPregenKeypair() {
    return this.pregenReady || this.loadPregenFromStorage()
  }

  // Use pre-generated keypair (consumes it)
  usePregenKeypair() {
    // Try storage first
    if (!this.pregenReady) {
      this.loadPregenFromStorage()
    }

    if (!this.pregenReady) return false

    this.ephemeralPrivateKey = this.pregenPrivateKey
    this.ephemeralPublicKey = this.pregenPublicKey
    this.pregenPrivateKey = null
    this.pregenPublicKey = null
    this.pregenReady = false
    return true
  }

  // Load user's enrolled keypair (public key pre-computed to avoid crypto)
  setPrivateKey(privateKeyHex, publicKeyHex) {
    this.enrolledPrivateKey = hexToBytes(privateKeyHex)
    if (publicKeyHex) {
      // Use pre-computed public key (no crypto needed)
      this.enrolledPublicKey = hexToBytes(publicKeyHex)
    } else {
      // Fallback: compute public key (slow, needs p256)
      this.enrolledPublicKey = getPublicKey(this.enrolledPrivateKey)
    }
  }

  // Get key ID (first 4 bytes of SHA1 of public key)
  getKeyId() {
    if (!this.enrolledPublicKey) return null
    const hash = sha1(this.enrolledPublicKey)
    return hash.slice(0, 4)
  }

  // Initiate session handshake
  requestSessionInfo(callback) {
    // Use pre-generated keypair if available (instant), otherwise generate (slow)
    if (!this.usePregenKeypair()) {
      this.ephemeralPrivateKey = generatePrivateKey()
      this.ephemeralPublicKey = getPublicKey(this.ephemeralPrivateKey)
    }

    // Generate routing address
    this.routingAddress = generateRoutingAddress()

    // Generate UUID for this request
    const uuid = generateUUID()

    // Build session info request
    const sessionInfoRequest = buildSessionInfoRequest(
      this.ephemeralPublicKey,
      generateUUID() // challenge
    )

    // Build routable message
    const message = buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      routingAddress: this.routingAddress,
      sessionInfoRequest: sessionInfoRequest,
      uuid: uuid
    })

    // Send via BLE
    teslaBLE.send(message, (result) => {
      if (!result.success) {
        callback({ success: false, error: result.error })
        return
      }

      // Parse response
      try {
        const response = parseRoutableMessage(result.data)

        if (response.sessionInfo) {
          this.vehiclePublicKey = response.sessionInfo.publicKey
          this.epoch = response.sessionInfo.epoch
          this.counter = response.sessionInfo.counter
          this.clockTime = response.sessionInfo.clockTime

          // Derive session key: K = SHA1(ECDH_x)[:16]
          const sharedSecret = ecdh(this.ephemeralPrivateKey, this.vehiclePublicKey)
          const keyMaterial = sha1(sharedSecret)
          this.sessionKey = keyMaterial.slice(0, 16)

          this.established = true

          // Pre-generate next keypair in background for faster next session
          setTimeout(() => this.pregenKeypair(), 100)

          callback({
            success: true,
            counter: this.counter,
            epoch: bytesToHex(this.epoch)
          })
        } else {
          callback({ success: false, error: 'No session info in response' })
        }
      } catch (e) {
        callback({ success: false, error: e.message })
      }
    })
  }

  // Build authenticated command
  buildAuthenticatedCommand(rkeAction) {
    if (!this.established) {
      throw new Error('Session not established')
    }

    // Increment counter
    this.counter++

    // Build the unsigned VCSEC message
    const unsignedMessage = buildUnsignedMessage({ rkeAction })

    // Build metadata for authentication
    // Metadata includes: signature_type, domain, VIN, epoch, expiration, counter, flags
    const expiresAt = this.clockTime + 60 // 60 seconds from vehicle clock

    // For HMAC authentication
    if (true) { // Use HMAC (simpler than AES-GCM)
      // Build signed message wrapper
      const signedMessage = buildSignedMessage({
        payload: unsignedMessage,
        signatureType: SIGNATURE_TYPE_HMAC,
        counter: this.counter,
        epoch: this.epoch,
        expiresAt: expiresAt
      })

      // Calculate HMAC over the signed message
      const hmac = hmacSha256(this.sessionKey, signedMessage)

      // Rebuild with signature
      const authenticatedMessage = buildSignedMessage({
        payload: unsignedMessage,
        signatureType: SIGNATURE_TYPE_HMAC,
        signature: hmac,
        counter: this.counter,
        epoch: this.epoch,
        expiresAt: expiresAt
      })

      // Wrap in ToVCSECMessage
      const toVcsec = buildToVCSECMessage(authenticatedMessage)

      // Build final routable message
      return buildRoutableMessage({
        toDomain: DOMAIN_VEHICLE_SECURITY,
        routingAddress: this.routingAddress,
        payload: toVcsec,
        uuid: generateUUID()
      })
    }
  }

  // Send authenticated command
  sendCommand(rkeAction, callback) {
    const doSend = () => {
      try {
        const message = this.buildAuthenticatedCommand(rkeAction)

        teslaBLE.send(message, (result) => {
          if (!result.success) {
            callback({ success: false, error: result.error })
            return
          }

          // Parse response
          try {
            const response = parseRoutableMessage(result.data)
            callback({ success: true, response })
          } catch (e) {
            callback({ success: false, error: e.message })
          }
        })
      } catch (e) {
        callback({ success: false, error: e.message })
      }
    }

    // Establish session if needed
    if (!this.established) {
      this.requestSessionInfo((result) => {
        if (!result.success) {
          callback(result)
          return
        }
        doSend()
      })
    } else {
      doSend()
    }
  }

  // Convenience methods for specific actions
  lock(callback) {
    this.sendCommand(RKE_ACTION_LOCK, callback)
  }

  unlock(callback) {
    this.sendCommand(RKE_ACTION_UNLOCK, callback)
  }

  openTrunk(callback) {
    this.sendCommand(RKE_ACTION_OPEN_TRUNK, callback)
  }

  openFrunk(callback) {
    this.sendCommand(RKE_ACTION_OPEN_FRUNK, callback)
  }

  // Pair key with vehicle (add to whitelist)
  // User must tap key card on center console when prompted
  pair(callback) {
    if (!this.enrolledPublicKey) {
      callback({ success: false, error: 'No public key configured' })
      return
    }

    // Generate routing address for this request
    this.routingAddress = generateRoutingAddress()

    // Build the key to add message
    const keyToAdd = buildKeyToAdd(
      this.enrolledPublicKey,
      KEY_ROLE_OWNER,
      KEY_FORM_FACTOR_ANDROID_DEVICE
    )

    // Build whitelist operation
    const whitelistOp = buildWhitelistOperation(keyToAdd)

    // Build unsigned message with whitelist operation
    const unsignedMessage = buildUnsignedMessageWithWhitelist(whitelistOp)

    // Build routable message (no session/signing needed for pairing)
    const message = buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      routingAddress: this.routingAddress,
      payload: unsignedMessage,
      uuid: generateUUID()
    })

    console.log('[Session] Sending pairing request...')

    // Send via BLE
    teslaBLE.send(message, (result) => {
      if (!result.success) {
        callback({ success: false, error: result.error })
        return
      }

      try {
        const response = parseRoutableMessage(result.data)
        console.log('[Session] Pairing response received')

        // Check for errors in response
        if (response.signedMessageStatus) {
          // There might be status info here
          console.log('[Session] Status:', response.signedMessageStatus)
        }

        // Pairing requires user to tap key card on car
        // The car will send a response after user confirms
        callback({
          success: true,
          message: 'Tap key card on center console to confirm',
          response
        })
      } catch (e) {
        callback({ success: false, error: e.message })
      }
    })
  }

  // Check if session is active
  isEstablished() {
    return this.established
  }

  // Get session status
  getStatus() {
    return {
      established: this.established,
      counter: this.counter,
      epoch: this.epoch ? bytesToHex(this.epoch) : null,
      hasKey: !!this.enrolledPrivateKey
    }
  }
}

// Singleton
const teslaSession = new TeslaSession()

export default teslaSession
