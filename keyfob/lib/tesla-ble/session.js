// Tesla BLE Session Management
// Handles ECDH key exchange, session establishment, and command authentication

import { sha1 } from './crypto/sha256.js'
import { hmacSha256, concatBytes, hexToBytes, bytesToHex } from './crypto/hmac.js'
import { ecdh } from './crypto/p256.js'
import { LocalStorage } from '@zos/storage'
import { decodeMessage } from './protocol/protobuf.js'
import {
  DOMAIN_VEHICLE_SECURITY,
  SIGNATURE_TYPE_HMAC,
  buildRoutableMessage,
  buildSessionInfoRequest,
  buildSignedMessage,
  buildToVCSECMessage,
  buildUnsignedMessage,
  parseRoutableMessage,
  generateUUID,
  generateRoutingAddress,
  RKE_ACTION_LOCK,
  RKE_ACTION_UNLOCK,
  RKE_ACTION_OPEN_TRUNK,
  RKE_ACTION_OPEN_FRUNK,
} from './protocol/vcsec.js'
import teslaBLE from './ble.js'

class TeslaSession {
  constructor() {
    this.storage = new LocalStorage()
    this.reset()
  }

  // Override storage (for file-based storage compatibility)
  setStorage(storageObject) {
    this.storage = storageObject
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

  // Pop one keypair from the binary key pool stored in LocalStorage
  // Pool is flat binary: N * 97 bytes (32 priv + 65 pub), base64-encoded
  popKeyFromPool() {
    try {
      const b64 = this.storage.getItem('key_pool')
      if (!b64) return null
      
      // Decode base64
      let decoded
      if (typeof atob !== 'undefined') {
        decoded = atob(b64)
      } else {
        decoded = this._base64Decode(b64)
      }
      
      const raw = Uint8Array.from(decoded, function(c) { return c.charCodeAt(0) })
      if (raw.length < 97) return null
      const priv = raw.slice(0, 32)
      const pub  = raw.slice(32, 97)
      const rest = raw.slice(97)
      
      if (rest.length > 0) {
        // Encode remaining pool back to base64
        let encoded
        if (typeof btoa !== 'undefined') {
          encoded = btoa(String.fromCharCode.apply(null, rest))
        } else {
          encoded = this._base64Encode(rest)
        }
        this.storage.setItem('key_pool', encoded)
      } else {
        this.storage.removeItem('key_pool')
      }
      return { privateKeyBytes: priv, publicKeyBytes: pub }
    } catch (e) {
      console.log('[Session] popKeyFromPool error:', e.message)
      return null
    }
  }
  
  // Manual base64 encoder (fallback for ZeppOS if btoa not available)
  _base64Encode(bytes) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    let result = ''
    let i = 0
    
    while (i < bytes.length) {
      const b1 = bytes[i++]
      const b2 = i < bytes.length ? bytes[i++] : 0
      const b3 = i < bytes.length ? bytes[i++] : 0
      
      result += chars[b1 >> 2]
      result += chars[((b1 & 3) << 4) | (b2 >> 4)]
      result += i - 2 < bytes.length ? chars[((b2 & 15) << 2) | (b3 >> 6)] : '='
      result += i - 1 < bytes.length ? chars[b3 & 63] : '='
    }
    
    return result
  }

  // Get number of keypairs remaining in pool
  getPoolSize() {
    try {
      const b64 = this.storage.getItem('key_pool')
      if (!b64) {
        console.log('[Session] getPoolSize: no pool data')
        return 0
      }
      console.log('[Session] getPoolSize: b64 length =', b64.length)
      
      // Decode base64 - check if atob is available
      if (typeof atob === 'undefined') {
        console.log('[Session] ERROR: atob is not defined!')
        // Fallback: manual base64 decode
        const decoded = this._base64Decode(b64)
        console.log('[Session] Manual decode: length =', decoded.length)
        return (decoded.length / 97) | 0
      }
      
      const decoded = atob(b64)
      console.log('[Session] atob decode: length =', decoded.length)
      return (decoded.length / 97) | 0
    } catch (e) {
      console.log('[Session] getPoolSize error:', e.message)
      return 0
    }
  }
  
  // Manual base64 decoder (fallback for ZeppOS if atob not available)
  _base64Decode(b64) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    let result = ''
    let bits = 0
    let bitCount = 0
    
    for (let i = 0; i < b64.length; i++) {
      if (b64[i] === '=') break
      const val = chars.indexOf(b64[i])
      if (val === -1) continue
      
      bits = (bits << 6) | val
      bitCount += 6
      
      if (bitCount >= 8) {
        bitCount -= 8
        result += String.fromCharCode((bits >> bitCount) & 0xFF)
        bits &= (1 << bitCount) - 1
      }
    }
    
    return result
  }

  // Load user's enrolled keypair (public key pre-computed to avoid crypto)
  setPrivateKey(privateKeyHex, publicKeyHex) {
    this.enrolledPrivateKey = hexToBytes(privateKeyHex)
    if (publicKeyHex) {
      this.enrolledPublicKey = hexToBytes(publicKeyHex)
    }
  }

  // Initiate session handshake
  requestSessionInfo(callback) {
    // Pop ephemeral keypair from pool (pre-generated by phone)
    const keypair = this.popKeyFromPool()
    if (!keypair) {
      callback({ success: false, error: 'Key pool empty' })
      return
    }

    this.ephemeralPrivateKey = keypair.privateKeyBytes  // Uint8Array[32]
    this.ephemeralPublicKey  = keypair.publicKeyBytes   // Uint8Array[65]

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
    teslaBLE.send(message, function(result) {
      if (!result.success) {
        callback({ success: false, error: result.error })
        return
      }

      // Parse response
      try {
        const response = parseRoutableMessage(result.data)
        console.log('[SESSION] Response fields: sessionInfo=' + (!!response.sessionInfo) + ', payload=' + (!!response.payload) + ', status=' + (!!response.signedMessageStatus) + ', field3=' + (!!response.field3))
        console.log('[SESSION] RX bytes: ' + (result.data ? result.data.length : 0))
        
        // Debug: check what fields are actually in the raw message
        const rawFields = decodeMessage(result.data)
        const fieldKeys = Object.keys(rawFields).sort((a,b) => a-b).join(',')
        console.log('[SESSION] Raw fields: [' + fieldKeys + ']')
        
        // Log field3 content if present
        if (response.field3) {
          if (response.field3 instanceof Uint8Array) {
            console.log('[SESSION] field3 is bytes (' + response.field3.length + ' bytes)')
          } else {
            console.log('[SESSION] field3 = ' + JSON.stringify(response.field3))
          }
        }

        if (response.sessionInfo) {
          this.vehiclePublicKey = response.sessionInfo.publicKey
          this.epoch = response.sessionInfo.epoch
          this.counter = response.sessionInfo.counter
          this.clockTime = response.sessionInfo.clockTime

          // Derive session key: K = SHA1(ECDH_x)[:16]
          // Note: ecdh() returns only x coordinate bytes
          const sharedSecret = ecdh(this.ephemeralPrivateKey, this.vehiclePublicKey)
          const keyMaterial = sha1(sharedSecret)
          this.sessionKey = keyMaterial.slice(0, 16)

          this.established = true

          console.log('[SESSION] Established: counter=' + this.counter + ', epoch=' + bytesToHex(this.epoch).slice(0, 8))
          callback({
            success: true,
            counter: this.counter,
            epoch: bytesToHex(this.epoch)
          })
        } else {
          console.log('[SESSION] ERROR: Response missing sessionInfo. payload=' + (!!response.payload) + ', status=' + (!!response.signedMessageStatus))
          callback({ success: false, error: 'No session info in response' })
        }
      } catch (e) {
        console.log('[SESSION] Exception: ' + e.message)
        callback({ success: false, error: e.message })
      }
    }.bind(this))
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

    // Expiration: 60 seconds from vehicle clock
    const expiresAt = this.clockTime + 60

    // Build signed message wrapper (without signature first, for HMAC input)
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

  // Send authenticated command
  sendCommand(rkeAction, callback) {
    const self = this

    const doSend = function() {
      try {
        const message = self.buildAuthenticatedCommand(rkeAction)

        teslaBLE.send(message, function(result) {
          if (!result.success) {
            callback({ success: false, error: result.error })
            return
          }

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
      this.requestSessionInfo(function(result) {
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
      poolSize: this.getPoolSize()
    }
  }
}

// Singleton
const teslaSession = new TeslaSession()

export default teslaSession
