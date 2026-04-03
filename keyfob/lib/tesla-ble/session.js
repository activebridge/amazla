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
        // Debug: dump raw message bytes as hex
        const dataHex = Array.from(result.data.slice(0, 31), x => x.toString(16).padStart(2, '0')).join('')
        console.log('[SESSION] Raw response hex: ' + dataHex)
        
        const response = parseRoutableMessage(result.data)
        console.log('[SESSION] Response fields: sessionInfo=' + (!!response.sessionInfo) + ', payload=' + (!!response.payload) + ', status=' + (!!response.signedMessageStatus))
        console.log('[SESSION] RX bytes: ' + (result.data ? result.data.length : 0))
        
        // Debug: dump raw response fields
        const rawFields = decodeMessage(result.data)
        const fieldKeys = Object.keys(rawFields).sort((a,b) => a-b).join(',')
        console.log('[SESSION] Raw fields in response: [' + fieldKeys + ']')
        
        if (rawFields[3]) {
          const field3Hex = Array.from(rawFields[3].slice(0, Math.min(32, rawFields[3].length)), x => x.toString(16).padStart(2, '0')).join('')
          console.log('[SESSION] field[3] raw bytes: ' + field3Hex + ' (len=' + rawFields[3].length + ')')
          
          // Detailed decode of field 3 structure
          console.log('[SESSION] === Detailed decode of field 3 ===')
          const field3Fields = decodeMessage(rawFields[3])
          const field3Keys = Object.keys(field3Fields).sort((a,b) => a-b).join(',')
          console.log('[SESSION] field[3] contains fields: [' + field3Keys + ']')
          
          for (const fieldNum in field3Fields) {
            const fieldData = field3Fields[fieldNum]
            if (fieldData.length === 0) {
              console.log('[SESSION]   field[3][' + fieldNum + ']: (empty)')
            } else {
              const dataHex = Array.from(fieldData.slice(0, Math.min(32, fieldData.length)), x => x.toString(16).padStart(2, '0')).join('')
              console.log('[SESSION]   field[3][' + fieldNum + ']: ' + dataHex + ' (len=' + fieldData.length + ')')
              
              // If this field looks like protobuf, decode it too
              if (fieldData[0] === 0x0a || fieldData[0] === 0x12 || fieldData[0] === 0x1a) {
                try {
                  const subFields = decodeMessage(fieldData)
                  const subKeys = Object.keys(subFields).sort((a,b) => a-b).join(',')
                  console.log('[SESSION]     -> nested fields: [' + subKeys + ']')
                  for (const subFieldNum in subFields) {
                    const subData = subFields[subFieldNum]
                    if (subData.length <= 32) {
                      const subDataHex = Array.from(subData, x => x.toString(16).padStart(2, '0')).join('')
                      console.log('[SESSION]        field[' + subFieldNum + ']: ' + subDataHex + ' (len=' + subData.length + ')')
                    } else {
                      const subDataHex = Array.from(subData.slice(0, 32), x => x.toString(16).padStart(2, '0')).join('')
                      console.log('[SESSION]        field[' + subFieldNum + ']: ' + subDataHex + '... (len=' + subData.length + ')')
                    }
                  }
                } catch (e) {
                  console.log('[SESSION]     -> failed to decode as protobuf: ' + e.message)
                }
              }
              
              // Attempt to identify what the 20-byte value might be
              if (fieldData.length === 20) {
                console.log('[SESSION]   ⚠️ 20-byte field detected - this is SHA1 size, not EC key size (65 bytes needed)')
              }
            }
          }
          
          // Log interpretation
          console.log('[SESSION] === SessionInfo Structure Analysis ===')
          console.log('[SESSION] Expected (per Tesla SDK Signatures.SessionInfo):')
          console.log('[SESSION]   field 1: counter (varint)')
          console.log('[SESSION]   field 2: publicKey (bytes, 65 for P-256)')
          console.log('[SESSION]   field 3: epoch (bytes, 16 bytes)')
          console.log('[SESSION]   field 4: clock_time (fixed32, 4 bytes)')
          console.log('[SESSION] Received (actual fields):')
          console.log('[SESSION]   field 1: ' + (field3Fields[1] ? field3Fields[1].length + ' bytes' : 'MISSING'))
          console.log('[SESSION]   field 2: ' + (field3Fields[2] ? field3Fields[2].length + ' bytes (nested protobuf!)' : 'MISSING'))
          console.log('[SESSION]   field 3: ' + (field3Fields[3] ? field3Fields[3].length + ' bytes' : 'MISSING'))
          console.log('[SESSION]   field 4: ' + (field3Fields[4] ? field3Fields[4].length + ' bytes' : 'MISSING'))
        }

        if (response.sessionInfo) {
          this.vehiclePublicKey = response.sessionInfo.publicKey
          this.epoch = response.sessionInfo.epoch
          this.counter = response.sessionInfo.counter
          this.clockTime = response.sessionInfo.clockTime
          
          // Debug: log public key details
          if (this.vehiclePublicKey) {
            console.log('[SESSION] Vehicle public key length: ' + this.vehiclePublicKey.length + ' bytes')
            const keyHex = Array.from(this.vehiclePublicKey.slice(0, 8), x => x.toString(16).padStart(2, '0')).join('')
            console.log('[SESSION] Vehicle public key starts with: ' + keyHex)
            // If it looks like protobuf (0a, 12, 1a pattern), decode it
            if (this.vehiclePublicKey[0] <= 0x1a) {
              console.log('[SESSION] Key looks like encoded protobuf, decoding...')
              const decoded = decodeMessage(this.vehiclePublicKey)
              const decodedKeys = Object.keys(decoded).sort((a,b) => a-b).join(',')
              console.log('[SESSION] Decoded key fields: [' + decodedKeys + ']')
            }
          } else {
            console.log('[SESSION] ERROR: publicKey is null/undefined')
          }

          // Validate public key before ECDH
          if (!this.vehiclePublicKey || this.vehiclePublicKey.length !== 65) {
            const actualLength = this.vehiclePublicKey ? this.vehiclePublicKey.length : 0
            console.log('[SESSION] ❌ INVALID PUBLIC KEY: received ' + actualLength + ' bytes, need 65 bytes')
            console.log('[SESSION] Cannot perform ECDH with ' + actualLength + '-byte key')
            console.log('[SESSION] This indicates non-standard SessionInfo format from vehicle')
            callback({ success: false, error: 'Invalid public key format: ' + actualLength + ' bytes instead of 65' })
            return
          }

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
