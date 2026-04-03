// Tesla BLE Session Management
// Handles ECDH key exchange, session establishment, and command authentication

import { sha1 } from './crypto/sha256.js'
import { hmacSha256, concatBytes, hexToBytes, bytesToHex } from './crypto/hmac.js'
import { ecdh, ecdhFixed, bytesToBigInt } from './crypto/p256.js'
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
  parseWhitelistEntryInfo,
  generateUUID,
  generateRoutingAddress,
  buildInformationRequest,
  INFO_REQUEST_GET_WHITELIST_ENTRY_INFO,
  RKE_ACTION_LOCK,
  RKE_ACTION_UNLOCK,
  RKE_ACTION_OPEN_TRUNK,
  RKE_ACTION_OPEN_FRUNK,
} from './protocol/vcsec.js'
import teslaBLE from './ble.js'

class TeslaSession {
  constructor() {
    this.storage = new LocalStorage()
    this.DEBUG_VEHICLE_PUBLIC_KEY = null // Set this to a Uint8Array[65] to test with hardcoded key
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
    
    // Session preservation for reconnects (preserves ECDH result)
    this.preserved = null
  }

  // Preserve session state for brief reconnections (e.g., within 5 minutes)
  // Allows reuse of ECDH result instead of recomputing
  preserveForReconnect(timeoutMs) {
    this.preserved = {
      ephemeralPrivateKey: this.ephemeralPrivateKey,
      ephemeralPublicKey: this.ephemeralPublicKey,
      vehiclePublicKey: this.vehiclePublicKey,
      epoch: this.epoch,
      counter: this.counter,
      clockTime: this.clockTime,
      sessionKey: this.sessionKey,
      routingAddress: this.routingAddress,
      timestamp: Date.now(),
      timeout: timeoutMs,
    }
    console.log('[Session] Session preserved for reconnect (timeout: ' + (timeoutMs / 1000).toFixed(1) + 's)')
  }

  // Check if a preserved session exists and is still valid
  isPreserved() {
    if (!this.preserved) return false
    var age = Date.now() - this.preserved.timestamp
    var isValid = age < this.preserved.timeout
    if (!isValid && this.preserved) {
      console.log('[Session] Preserved session expired (' + (age / 1000).toFixed(1) + 's old)')
      this.preserved = null
    }
    return isValid
  }

  // Restore session from preserved state (clears preserved state after restore)
  restorePreservedSession() {
    if (!this.isPreserved()) return false
    
    var session = this.preserved
    this.ephemeralPrivateKey = session.ephemeralPrivateKey
    this.ephemeralPublicKey = session.ephemeralPublicKey
    this.vehiclePublicKey = session.vehiclePublicKey
    this.epoch = session.epoch
    this.counter = session.counter
    this.clockTime = session.clockTime
    this.sessionKey = session.sessionKey
    this.routingAddress = session.routingAddress
    this.established = true
    this.preserved = null
    
    var age = Date.now() - session.timestamp
    console.log('[Session] Session restored from preserved state (age: ' + (age / 1000).toFixed(1) + 's)')
    return true
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

  // Try to load vehicle's EC public key from storage (obtained during pairing)
  // Returns true if key was loaded, false if not found
  loadVehiclePublicKey() {
    try {
      const pubKeyHex = this.storage.getItem('vehicle_ec_public_key')
      if (!pubKeyHex) {
        console.log('[SESSION] Vehicle public key not found in storage (pair first)')
        return false
      }
      
      if (pubKeyHex.length !== 130) { // 65 bytes = 130 hex characters
        console.log('[SESSION] Vehicle public key corrupt: ' + pubKeyHex.length + ' chars instead of 130')
        return false
      }
      
      this.vehiclePublicKey = hexToBytes(pubKeyHex)
      const keyStart = pubKeyHex.slice(0, 16)
      console.log('[SESSION] Loaded vehicle public key: ' + keyStart + '...')
      return true
    } catch (e) {
      console.log('[SESSION] Error loading vehicle public key:', e.message)
      return false
    }
  }

  // Load precomputed doublings table built by phone during pairing.
  // Returns Array[256] of [Uint32Array(8), Uint32Array(8)] pairs, or null if unavailable.
  loadDoublingsTable() {
    try {
      const b64 = this.storage.getItem('vehicle_doublings_table')
      if (!b64) {
        console.log('[SESSION] Doublings table not found (will use standard ECDH)')
        return null
      }

      let decoded
      if (typeof atob !== 'undefined') {
        decoded = atob(b64)
      } else {
        decoded = this._base64Decode(b64)
      }

      const raw = Uint8Array.from(decoded, function(c) { return c.charCodeAt(0) })
      if (raw.length !== 256 * 64) {
        console.log('[SESSION] Doublings table wrong size: ' + raw.length + ' bytes (need 16384)')
        return null
      }

      // table[0] = Q (the vehicle's public key); validate it matches vehiclePublicKey
      if (this.vehiclePublicKey && this.vehiclePublicKey.length === 65) {
        for (let i = 0; i < 32; i++) {
          if (raw[i] !== this.vehiclePublicKey[1 + i] || raw[32 + i] !== this.vehiclePublicKey[33 + i]) {
            console.log('[SESSION] Doublings table is for a different vehicle key — discarding')
            return null
          }
        }
      }

      const table = []
      for (let i = 0; i < 256; i++) {
        table.push([bytesToBigInt(raw.slice(i * 64, i * 64 + 32)),
                    bytesToBigInt(raw.slice(i * 64 + 32, i * 64 + 64))])
      }
      console.log('[SESSION] ✓ Loaded precomputed doublings table (256 entries, 16 KB)')
      console.log('[SESSION] ECDH will use fast path: ~128 additions, 0 doublings')
      return table
    } catch (e) {
      console.log('[SESSION] loadDoublingsTable error: ' + e.message)
      return null
    }
  }

  // Request the vehicle's public key via GetWhitelistEntryInfo
  // This is the proper way to get the long-term EC key after pairing
  // Returns true if key was obtained, false otherwise
  requestVehiclePublicKey(callback) {
    console.log('[SESSION] Requesting vehicle public key via GetWhitelistEntryInfo...')
    
    // Build InformationRequest with GET_WHITELIST_ENTRY_INFO
    // Parameter: our public key (to identify ourselves)
    const infoRequest = buildInformationRequest(
      INFO_REQUEST_GET_WHITELIST_ENTRY_INFO,
      null,
      this.enrolledPublicKey
    )
    const unsignedMsg = buildUnsignedMessage({ informationRequest: infoRequest })
    const signedMsg = buildSignedMessage(unsignedMsg)
    const toMsg = buildToVCSECMessage(signedMsg)
    const routableMsg = buildRoutableMessage(toMsg, DOMAIN_VEHICLE_SECURITY)
    
    teslaBLE.send(routableMsg, (r) => {
      if (!r.success) {
        console.log('[SESSION] GetWhitelistEntryInfo request failed:', r.error)
        callback({ success: false, error: 'Failed to get whitelist entry info' })
        return
      }
      
      // Response is FromVCSECMessage (may be wrapped in RoutableMessage field 10)
      // Parse to find field 17 (WhitelistEntryInfo)
      try {
        let fields = decodeMessage(r.data)
        
        // If wrapped in RoutableMessage, field 10 contains FromVCSECMessage
        if (fields[10] instanceof Uint8Array) {
          fields = decodeMessage(fields[10])
        }
        
        // Look for field 17 (WhitelistEntryInfo)
        if (fields[17] instanceof Uint8Array) {
          const wlEntryInfo = parseWhitelistEntryInfo(fields[17])
          if (wlEntryInfo.publicKey && wlEntryInfo.publicKey.length === 65) {
            this.vehiclePublicKey = wlEntryInfo.publicKey
            
            // Save to storage for future use
            const keyHex = Array.from(this.vehiclePublicKey, x => x.toString(16).padStart(2, '0')).join('')
            this.storage.setItem('vehicle_ec_public_key', keyHex)
            
            const keyStart = keyHex.slice(0, 16)
            console.log('[SESSION] ✓ Got vehicle public key from WhitelistEntryInfo: ' + keyStart + '...')
            callback({ success: true, vehiclePublicKey: this.vehiclePublicKey })
            return
          }
        }
        
        console.log('[SESSION] WhitelistEntryInfo response missing field 17 with public key')
        callback({ success: false, error: 'No public key in whitelist entry info' })
      } catch (e) {
        console.log('[SESSION] Error parsing whitelist entry info response:', e.message)
        callback({ success: false, error: 'Failed to parse whitelist entry info: ' + e.message })
      }
    })
  }

  // Initiate session handshake
  requestSessionInfo(callback) {
    // Try to load vehicle's EC public key from storage (obtained during pairing)
    // If missing, attempt to fetch via GetWhitelistEntryInfo
    if (!this.vehiclePublicKey) {
      this.loadVehiclePublicKey() // Loads from storage if available
      
      // If still missing, try to fetch via GetWhitelistEntryInfo
      if (!this.vehiclePublicKey) {
        console.log('[SESSION] Vehicle EC key not in storage, attempting to fetch via GetWhitelistEntryInfo...')
        return this.requestVehiclePublicKey(function(keyResult) {
          if (keyResult.success) {
            console.log('[SESSION] Successfully obtained vehicle public key, now requesting session info...')
            // Recursively call requestSessionInfo with the key now available
            this.requestSessionInfo(callback)
          } else {
            console.log('[SESSION] Failed to fetch vehicle EC key, continuing with fallback...')
            // Continue with session request using SessionInfo ephemeral key fallback
            this._doSessionInfoRequest(callback)
          }
        }.bind(this))
      }
    }
    
    // EC key is available (either from storage or just fetched), proceed with session request
    this._doSessionInfoRequest(callback)
  }

  _doSessionInfoRequest(callback) {
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

    // Debug: log the request being sent
    const msgHex = Array.from(message.slice(0, Math.min(64, message.length)), x => x.toString(16).padStart(2, '0')).join('')
    console.log('[SESSION] TX request (first 64 bytes): ' + msgHex + (message.length > 64 ? '... total ' + message.length + ' bytes' : ''))

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
          // Try to use vehicle public key from response first
          if (response.sessionInfo.publicKey && response.sessionInfo.publicKey.length === 65) {
            this.vehiclePublicKey = response.sessionInfo.publicKey
            console.log('[SESSION] Got vehicle public key from SessionInfo response')
            
            // If we don't have vehicle EC key in storage yet, save this ephemeral key
            // as a fallback. In production, this should be the long-term key from pairing.
            // But if pairing doesn't provide field 17, we use ephemeral as proxy.
            if (!this.storage.getItem('vehicle_ec_public_key')) {
              const keyHex = Array.from(response.sessionInfo.publicKey, x => x.toString(16).padStart(2, '0')).join('')
              this.storage.setItem('vehicle_ec_public_key', keyHex)
              console.log('[SESSION] ✓ Saved vehicle public key from SessionInfo as fallback (no pairing key found)')
            }
          } else {
            // SessionInfo response doesn't have valid key - try loading from storage (pairing result)
            console.log('[SESSION] SessionInfo response has no valid public key')
            if (!this.vehiclePublicKey) { // Not already loaded
              const keyLoaded = this.loadVehiclePublicKey()
              if (!keyLoaded) {
                console.log('[SESSION] ❌ No vehicle public key available from storage or response')
                console.log('[SESSION] Please complete pairing first to obtain vehicle EC key')
                callback({ success: false, error: 'Vehicle public key not found. Complete pairing first.' })
                return
              }
            }
          }
          
          this.epoch = response.sessionInfo.epoch
          this.counter = response.sessionInfo.counter
          this.clockTime = response.sessionInfo.clockTime
          
          // Debug: log public key details
          if (this.vehiclePublicKey) {
            console.log('[SESSION] Vehicle public key length: ' + this.vehiclePublicKey.length + ' bytes')
            const keyHex = Array.from(this.vehiclePublicKey.slice(0, 8), x => x.toString(16).padStart(2, '0')).join('')
            console.log('[SESSION] Vehicle public key starts with: ' + keyHex)
          } else {
            console.log('[SESSION] ERROR: vehiclePublicKey is null/undefined')
          }

          // Validate public key before ECDH
          if (!this.vehiclePublicKey || this.vehiclePublicKey.length !== 65) {
            const actualLength = this.vehiclePublicKey ? this.vehiclePublicKey.length : 0
            console.log('[SESSION] ❌ INVALID PUBLIC KEY: ' + actualLength + ' bytes, need 65')
            callback({ success: false, error: 'Invalid vehicle public key: ' + actualLength + ' bytes' })
            return
          }

          // Derive session key: K = SHA1(ECDH_x)[:16]
          // Fast path: use precomputed doublings table if available (eliminates all doublings)
          const _ecdhTable = this.loadDoublingsTable()
          let sharedSecret
          if (_ecdhTable) {
            console.log('[SESSION] ECDH: Using FAST path (precomputed table, ~128 additions, 0 doublings)')
            sharedSecret = ecdhFixed(this.ephemeralPrivateKey, _ecdhTable)
          } else {
            console.log('[SESSION] ECDH: Using standard path (256 doublings + 64 additions, ~8 seconds)')
            sharedSecret = ecdh(this.ephemeralPrivateKey, this.vehiclePublicKey)
          }
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
