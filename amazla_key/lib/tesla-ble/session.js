
import { sha1 } from './crypto/sha256.js'
import { hmacSha256, hexToBytes, bytesToHex } from './crypto/hmac.js'
import { ecdhFixed, bytesToBigInt } from './crypto/p256.js'
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
  parseVehicleStatus,
  INFO_REQUEST_GET_WHITELIST_ENTRY_INFO,
  INFO_REQUEST_GET_STATUS,
  RKE_ACTION_LOCK,
  RKE_ACTION_UNLOCK,
} from './protocol/vcsec.js'
import teslaBLE from './ble.js'
function byteToHex(byte) {
  const hex = byte.toString(16)
  return hex.length === 1 ? '0' + hex : hex
}
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
class TeslaSession {
  constructor() {
    this.storage = new LocalStorage()
    this.DEBUG_VEHICLE_PUBLIC_KEY = null // Set this to a Uint8Array[65] to test with hardcoded key
    this.onPoolLow = null // Callback when pool gets low - receives callback(count) to request from phone
    this.reset()
  }
  setStorage(storageObject) {
    this.storage = storageObject
  }
  reset() {
    this.ephemeralPrivateKey = null
    this.ephemeralPublicKey = null
    this.vehiclePublicKey = null
    this.epoch = null
    this.counter = 0
    this.clockTime = 0
    this.sessionKey = null
    this.routingAddress = null
    this.established = false
    this.preserved = null
    this.replenishingPool = false
    this.connectingPromise = null // Guard against duplicate connection attempts
    this.pendingCallbacks = null // Queue for concurrent ensureSessionEstablished calls
  }
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
  popKeyFromPool() {
    try {
      const b64 = this.storage.getItem('key_pool')
      if (!b64) {
        if (this.onPoolLow && !this.replenishingPool) {
          this.replenishingPool = true
          this.onPoolLow(15)
        }
        return null
      }
      const decoded = typeof atob !== 'undefined' ? atob(b64) : this._base64Decode(b64)
      const raw = Uint8Array.from(decoded, function(c) { return c.charCodeAt(0) })
      if (raw.length < 97) {
        if (this.onPoolLow && !this.replenishingPool) {
          this.replenishingPool = true
          this.onPoolLow(15)
        }
        return null
      }
      const priv = raw.slice(0, 32)
      const pub  = raw.slice(32, 97)
      const rest = raw.slice(97)
      const poolSize = Math.floor(rest.length / 97)
      
      rest.length > 0 
        ? this.storage.setItem('key_pool', typeof btoa !== 'undefined' ? btoa(String.fromCharCode.apply(null, rest)) : this._base64Encode(rest))
        : this.storage.removeItem('key_pool')
      
      // Trigger replenishment when pool gets low
      if (poolSize < 5 && this.onPoolLow && !this.replenishingPool) {
        this.replenishingPool = true
        this.onPoolLow(15)
      }
      
      return { privateKeyBytes: priv, publicKeyBytes: pub }
    } catch (e) {
      console.log('[Session] popKeyFromPool error:', e.message)
      return null
    }
  }
  completePoolReplenishment() {
    this.replenishingPool = false
  }
  _base64Encode(bytes) {
    let result = ''
    let i = 0
    
    while (i < bytes.length) {
      const b1 = bytes[i++]
      const b2 = i < bytes.length ? bytes[i++] : 0
      const b3 = i < bytes.length ? bytes[i++] : 0
      
      result += BASE64_CHARS[b1 >> 2]
      result += BASE64_CHARS[((b1 & 3) << 4) | (b2 >> 4)]
      result += i - 2 < bytes.length ? BASE64_CHARS[((b2 & 15) << 2) | (b3 >> 6)] : '='
      result += i - 1 < bytes.length ? BASE64_CHARS[b3 & 63] : '='
    }
    
    return result
  }
  getPoolSize() {
    try {
      const b64 = this.storage.getItem('key_pool')
      if (!b64) {
        console.log('[Session] getPoolSize: no pool data')
        return 0
      }
      console.log('[Session] getPoolSize: b64 length =', b64.length)
      const decoded = typeof atob === 'undefined' 
        ? (console.log('[Session] ERROR: atob is not defined!'), this._base64Decode(b64))
        : atob(b64)
      console.log('[Session]', typeof atob === 'undefined' ? 'Manual' : 'atob', 'decode: length =', decoded.length)
      return (decoded.length / 97) | 0
    } catch (e) {
      console.log('[Session] getPoolSize error:', e.message)
      return 0
    }
  }
  _base64Decode(b64) {
    let result = ''
    let bits = 0
    let bitCount = 0
    
    for (let i = 0; i < b64.length; i++) {
      if (b64[i] === '=') break
      const val = BASE64_CHARS.indexOf(b64[i])
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
  setPrivateKey(privateKeyHex, publicKeyHex) {
    this.enrolledPrivateKey = hexToBytes(privateKeyHex)
    if (publicKeyHex) {
      this.enrolledPublicKey = hexToBytes(publicKeyHex)
    }
  }
  loadVehiclePublicKey() {
    try {
      const pubKeyHex = this.storage.getItem('vehicle_ec_public_key')
      if (pubKeyHex && pubKeyHex.length === 130) {
        this.vehiclePublicKey = hexToBytes(pubKeyHex)
        const keyStart = pubKeyHex.slice(0, 16)
        console.log('[SESSION] Loaded vehicle public key from storage: ' + keyStart + '...')
        return true
      }
      
      console.log('[SESSION] Vehicle public key not found in storage (pair with vehicle first)')
      return false
    } catch (e) {
      console.log('[SESSION] Error loading vehicle public key:', e.message)
      return false
    }
  }
  loadDoublingsTable() {
    try {
      const b64 = this.storage.getItem('vehicle_doublings_table')
      if (!b64) {
        console.log('[SESSION] Doublings table not found (will use standard ECDH)')
        return null
      }
      const decoded = typeof atob !== 'undefined' ? atob(b64) : this._base64Decode(b64)
      const raw = Uint8Array.from(decoded, function(c) { return c.charCodeAt(0) })
      if (raw.length !== 256 * 64) {
        console.log('[SESSION] Doublings table wrong size: ' + raw.length + ' bytes (need 16384)')
        return null
      }
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
  requestVehiclePublicKey(callback) {
    const self = this
    const ensureConnectedAndFetch = function() {
      if (teslaBLE.isConnected()) {
        console.log('[SESSION] ✓ BLE connected, requesting vehicle public key')
        doFetch()
        return
      }
      
      const mac = self.storage.getItem('tesla_ble_mac') || self.storage.getItem('vehicle_mac')
      if (!mac) {
        callback({ success: false, error: 'Vehicle MAC not found' })
        return
      }
      
      console.log('[SESSION] Connecting to vehicle for EC key fetch...')
      teslaBLE.disconnect()
      
      teslaBLE.connect(mac, function(result) {
        if (!result.success) {
          callback({ success: false, error: 'BLE connection failed: ' + (result.error || 'unknown') })
          return
        }
        
        console.log('[SESSION] ✓ Connected, fetching EC key')
        doFetch()
      })
    }
    
    const doFetch = function() {
      console.log('[SESSION] Requesting vehicle public key via GetWhitelistEntryInfo...')
      const infoRequest = buildInformationRequest(
        INFO_REQUEST_GET_WHITELIST_ENTRY_INFO,
        null,
        null,
        0  // slot 0 = first enrolled key
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
        try {
          let fields = decodeMessage(r.data)
          if (fields[10] instanceof Uint8Array) {
            fields = decodeMessage(fields[10])
          }
          if (fields[17] instanceof Uint8Array) {
            const wlEntryInfo = parseWhitelistEntryInfo(fields[17])
            if (wlEntryInfo.publicKey && wlEntryInfo.publicKey.length === 65) {
              self.vehiclePublicKey = wlEntryInfo.publicKey
              const keyHex = Array.from(self.vehiclePublicKey, x => byteToHex(x)).join('')
              self.storage.setItem('vehicle_ec_public_key', keyHex)
              
              const keyStart = keyHex.slice(0, 16)
              console.log('[SESSION] ✓ Got vehicle public key from WhitelistEntryInfo: ' + keyStart + '...')
              callback({ success: true, vehiclePublicKey: self.vehiclePublicKey })
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
    
    ensureConnectedAndFetch()
  }
  requestSessionInfo(callback) {
    // Early exit if table not available - don't proceed with session at all
    if (!this.storage.getItem('vehicle_doublings_table')) {
      console.log('[SESSION] ❌ Doublings table not found - cannot establish session')
      callback({ success: false, error: 'Doublings table not found. Please complete pairing first.' })
      return
    }
    
    const self = this
    const ensureConnected = function() {
      if (teslaBLE.isConnected()) {
        console.log('[SESSION] ✓ BLE already connected and ready')
        proceedWithSession()
        return
      }
      
      const mac = self.storage.getItem('tesla_ble_mac') || self.storage.getItem('vehicle_mac')
      if (!mac) {
        callback({ success: false, error: 'Vehicle MAC not found. Complete pairing first.' })
        return
      }
      if (teslaBLE.isConnected()) {
        console.log('[SESSION] Disconnecting existing connection...')
        teslaBLE.disconnect()
      }
      const doConnect = function(attempt) {
        console.log('[SESSION] Connecting to vehicle: ' + mac + ' (attempt ' + attempt + ')')
        teslaBLE.connect(mac, function(result) {
          console.log('[SESSION] Connect callback fired, result:', JSON.stringify(result))
          if (!result.success) {
            // Retry once on "disconnected during setup" — vehicle needs a moment
            if (attempt === 1 && result.error && result.error.indexOf('disconnected during setup') !== -1) {
              console.log('[SESSION] Vehicle dropped connection during setup, retrying in 2s...')
              setTimeout(function() { doConnect(2) }, 2000)
              return
            }
            console.log('[SESSION] ✗ Connection failed: ' + (result.error || 'unknown'))
            callback({ success: false, error: 'BLE connection failed: ' + (result.error || 'unknown') })
            return
          }
          console.log('[SESSION] ✓ Connected to vehicle, proceeding')
          proceedWithSession()
        })
      }
      doConnect(1)
    }
    
    const proceedWithSession = function() {
      if (!self.vehiclePublicKey) {
        self.loadVehiclePublicKey() // Loads from storage if available
        if (!self.vehiclePublicKey) {
          console.log('[SESSION] Vehicle EC key not in storage, attempting to fetch via GetWhitelistEntryInfo...')
          return self.requestVehiclePublicKey(function(keyResult) {
            if (keyResult.success) {
              console.log('[SESSION] Successfully obtained vehicle public key, now requesting session info...')
              proceedWithSession()
            } else {
              console.log('[SESSION] Failed to fetch vehicle EC key, continuing with fallback...')
              self._doSessionInfoRequest(callback)
            }
          })
        }
      }
      self._doSessionInfoRequest(callback)
    }
    
    ensureConnected()
  }
  _doSessionInfoRequest(callback) {
    const keypair = this.popKeyFromPool()
    if (!keypair) {
      callback({ success: false, error: 'Key pool empty — sync from phone (GEN POOL)' })
      return
    }
    this.ephemeralPrivateKey = keypair.privateKeyBytes  // Uint8Array[32]
    this.ephemeralPublicKey  = keypair.publicKeyBytes   // Uint8Array[65]
    this.routingAddress = generateRoutingAddress()
    const uuid = generateUUID()
    const sessionInfoRequest = buildSessionInfoRequest(
      this.ephemeralPublicKey,
      null // SessionInfoRequest contains ONLY publicKey; challenge comes from request UUID (field 50)
    )
    const message = buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      routingAddress: this.routingAddress,
      sessionInfoRequest: sessionInfoRequest,
      uuid: uuid
    })
    const msgHex = Array.from(message.slice(0, Math.min(64, message.length)), x => byteToHex(x)).join('')
    console.log('[SESSION] TX request (first 64 bytes): ' + msgHex + (message.length > 64 ? '... total ' + message.length + ' bytes' : ''))
    const self = this
    const sessionInfoResponseHandler = function(result) {
      if (!result.success) {
        callback({ success: false, error: result.error })
        return
      }
       try {
         if (!result.data) {
           console.log('[SESSION] ERROR: result.data is null/undefined')
           callback({ success: false, error: 'No data in response' })
           return
         }
         const dataHex = Array.from(result.data.slice(0, 31), x => byteToHex(x)).join('')
         console.log('[SESSION] Raw response hex: ' + dataHex)

        const response = parseRoutableMessage(result.data)
        console.log('[SESSION] Response fields: sessionInfo=' + (!!response.sessionInfo) + ', payload=' + (!!response.payload) + ', status=' + (!!response.signedMessageStatus))
        const rawFields = decodeMessage(result.data)
        const fieldKeys = Object.keys(rawFields).sort(function(a,b) { return a-b }).join(',')
        console.log('[SESSION] Raw fields in response: [' + fieldKeys + ']')

        // If no sessionInfo, payload, or status — this is an intermediate ack from the vehicle.
        // Signal _requeue so wrappedCallback re-registers sessionInfoResponseHandler for the real response.
        if (!response.sessionInfo && !response.payload && !response.signedMessageStatus) {
          console.log('[SESSION] Intermediate ack (fields:[' + fieldKeys + ']), waiting for SessionInfo...')
          teslaBLE.responseCallback = sessionInfoResponseHandler
          return
        }

        console.log('[SESSION] RX bytes: ' + (result.data ? result.data.length : 0))
        if (response.sessionInfo) {
          if (response.sessionInfo.publicKey && response.sessionInfo.publicKey.length === 65) {
            self.vehiclePublicKey = response.sessionInfo.publicKey
            console.log('[SESSION] Got vehicle public key from SessionInfo response')
            if (!self.storage.getItem('vehicle_ec_public_key')) {
              const keyHex = Array.from(response.sessionInfo.publicKey, x => byteToHex(x)).join('')
              self.storage.setItem('vehicle_ec_public_key', keyHex)
              console.log('[SESSION] ✓ Saved vehicle public key from SessionInfo as fallback (no pairing key found)')
            }
          } else {
            console.log('[SESSION] SessionInfo response has no valid public key')
            if (!self.vehiclePublicKey) {
              const keyLoaded = self.loadVehiclePublicKey()
              if (!keyLoaded) {
                console.log('[SESSION] ❌ No vehicle public key available from storage or response')
                console.log('[SESSION] Please complete pairing first to obtain vehicle EC key')
                callback({ success: false, error: 'Vehicle public key not found. Complete pairing first.' })
                return
              }
            }
          }

          self.epoch = response.sessionInfo.epoch
          self.counter = response.sessionInfo.counter
          self.clockTime = response.sessionInfo.clockTime
          if (self.vehiclePublicKey) {
            console.log('[SESSION] Vehicle public key length: ' + self.vehiclePublicKey.length + ' bytes')
            const keyHex = Array.from(self.vehiclePublicKey.slice(0, 8), x => byteToHex(x)).join('')
            console.log('[SESSION] Vehicle public key starts with: ' + keyHex)
          } else {
            console.log('[SESSION] ERROR: vehiclePublicKey is null/undefined')
          }
          if (!self.vehiclePublicKey || self.vehiclePublicKey.length !== 65) {
            const actualLength = self.vehiclePublicKey ? self.vehiclePublicKey.length : 0
            console.log('[SESSION] ❌ INVALID PUBLIC KEY: ' + actualLength + ' bytes, need 65')
            callback({ success: false, error: 'Invalid vehicle public key: ' + actualLength + ' bytes' })
            return
          }
          const _ecdhTable = self.loadDoublingsTable()
          if (!_ecdhTable) {
            callback({ success: false, error: 'No ECDH table — re-pair to generate' })
            return
          }
          const sharedSecret = ecdhFixed(self.ephemeralPrivateKey, _ecdhTable)
          const keyMaterial = sha1(sharedSecret)
          self.sessionKey = keyMaterial.slice(0, 16)
          self.established = true
          console.log('[SESSION] Established: counter=' + self.counter + ', epoch=' + bytesToHex(self.epoch).slice(0, 8))
          callback({
            success: true,
            counter: self.counter,
            epoch: bytesToHex(self.epoch)
          })
        } else {
          const fieldList = Object.keys(rawFields).sort(function(a,b) { return a-b }).join(', ')
          console.log('[SESSION] ❌ ERROR: Response missing sessionInfo')
          console.log('[SESSION] Fields present: [' + fieldList + ']')
          callback({ success: false, error: 'No session info in response. Fields: [' + fieldList + ']' })
        }
      } catch (e) {
        console.log('[SESSION] Exception: ' + e.message)
        if (e.stack) console.log('[SESSION] Stack: ' + e.stack)
        callback({ success: false, error: e.message })
      }
    }
    teslaBLE.send(message, sessionInfoResponseHandler)
  }
  buildAuthenticatedCommand(rkeAction) {
    if (!this.established) {
      throw new Error('Session not established')
    }
    this.counter++
    const unsignedMessage = buildUnsignedMessage({ rkeAction })
    const expiresAt = this.clockTime + 60
    const signedMessage = buildSignedMessage({
      payload: unsignedMessage,
      signatureType: SIGNATURE_TYPE_HMAC,
      counter: this.counter,
      epoch: this.epoch,
      expiresAt: expiresAt
    })
    const hmac = hmacSha256(this.sessionKey, signedMessage)
    const authenticatedMessage = buildSignedMessage({
      payload: unsignedMessage,
      signatureType: SIGNATURE_TYPE_HMAC,
      signature: hmac,
      counter: this.counter,
      epoch: this.epoch,
      expiresAt: expiresAt
    })
    const toVcsec = buildToVCSECMessage(authenticatedMessage)
    return buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      routingAddress: this.routingAddress,
      payload: toVcsec,
      uuid: generateUUID()
    })
  }
  sendCommand(rkeAction, callback) {
    const self = this
    const doSend = function() {
      try {
        const message = self.buildAuthenticatedCommand(rkeAction)
        let gotFirstResponse = false
        teslaBLE.send(message, function(result) {
          if (!result.success) {
            callback({ success: false, error: result.error })
            return
          }
          try {
            const response = parseRoutableMessage(result.data)
            
            // Vehicle sends two responses for commands: (1) status push (field 3 only), (2) action response (field 1 + field 3/6)
            // If we only got SessionInfo without actionStatus, re-queue to wait for the second response
            if (!response.actionStatus && !gotFirstResponse) {
              gotFirstResponse = true
              console.log('[SESSION] Got SessionInfo status push, waiting for action response...')
              result._requeue = true  // Tell BLE to re-register callback
              // Don't call user's callback yet, wait for the real response with actionStatus
              return
            }
            
            // This is either the first response with actionStatus, or the second response
            callback({ success: true, response })
          } catch (e) {
            callback({ success: false, error: e.message })
          }
        })
      } catch (e) {
        callback({ success: false, error: e.message })
      }
    }
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
  sendRKECommand(action, callback) {
    this.sendCommand(action, callback)
  }
  getVehicleStatus(callback) {
    if (!this.established) {
      callback({ success: false, error: 'Session not established' })
      return
    }
    const infoRequest = buildInformationRequest(INFO_REQUEST_GET_STATUS)
    const message = buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      routingAddress: this.routingAddress,
      informationRequest: infoRequest,
      uuid: generateUUID()
    })
    const self = this
    teslaBLE.send(message, function(result) {
      if (!result.success) {
        callback({ success: false, error: result.error })
        return
      }
      try {
        if (!result.data) {
          callback({ success: false, error: 'No data in vehicle status response' })
          return
        }
        const response = parseRoutableMessage(result.data)
        const vehicleStatus = parseVehicleStatus(response.payload)
        callback({ success: true, status: vehicleStatus })
      } catch (e) {
        console.log('[SESSION] getVehicleStatus error: ' + e.message)
        callback({ success: false, error: e.message })
      }
    })
  }
  lock(callback) {
    this.sendCommand(RKE_ACTION_LOCK, callback)
  }
  unlock(callback) {
    this.sendCommand(RKE_ACTION_UNLOCK, callback)
  }
  isEstablished() {
    return this.established
  }
  isPaired() {
    // Check if pairing data exists (means user completed pairing flow)
    return !!this.storage.getItem('key_pool') && !!this.storage.getItem('vehicle_ec_public_key')
  }
  ensureSessionEstablished(callback) {
    // If session already established, call callback immediately
    if (this.established) {
      callback({ success: true })
      return
    }
    // If not paired yet, return error
    if (!this.isPaired()) {
      callback({ success: false, error: 'Not paired - go to BLE page first' })
      return
    }
    // If already connecting, queue callback instead of creating duplicate connection
    if (this.connectingPromise) {
      // Connection in progress, add to pending callbacks
      this.pendingCallbacks = this.pendingCallbacks || []
      this.pendingCallbacks.push(callback)
      return
    }
    // Initialize pending callbacks array
    this.pendingCallbacks = [callback]
    
    // Create a promise for the connection attempt to prevent duplicates
    this.connectingPromise = new Promise((resolve) => {
      this.requestSessionInfo((result) => {
        this.connectingPromise = null
        
        // Call all pending callbacks with the result
        const callbacks = this.pendingCallbacks || [callback]
        this.pendingCallbacks = null
        callbacks.forEach(cb => cb(result))
        
        resolve()
      })
    })
  }
  getStatus() {
    return {
      established: this.established,
      counter: this.counter,
      epoch: this.epoch ? bytesToHex(this.epoch) : null,
      poolSize: this.getPoolSize()
    }
  }
}
const teslaSession = new TeslaSession()
export { TeslaSession }
export default teslaSession
