
import { sha1 } from './crypto/sha256.js'
import { sha256 } from './crypto/sha256.js'
import { ecdhFixed } from './crypto/p256.js'
import { binaryStringToBytes, bytesToBinaryString } from './crypto/binary-utils.js'
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

class TeslaSession {
  constructor() {
    this.storage = new LocalStorage()
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
    this._connecting = false   // guard against duplicate connection attempts
    this.pendingCallbacks = null
    this._doublingsTable = null // cached after first parse; invalidated on reset
    this._hmacInner = null     // pre-computed HMAC inner pad (sessionKey XOR 0x36, padded to 64 bytes)
    this._hmacOuter = null     // pre-computed HMAC outer pad (sessionKey XOR 0x5c, padded to 64 bytes)
  }
  _initHmacPads() {
    this._hmacInner = new Uint8Array(64)
    this._hmacOuter = new Uint8Array(64)
    for (let i = 0; i < 64; i++) {
      const k = i < this.sessionKey.length ? this.sessionKey[i] : 0
      this._hmacInner[i] = k ^ 0x36
      this._hmacOuter[i] = k ^ 0x5c
    }
  }
  _hmac(message) {
    const innerData = new Uint8Array(64 + message.length)
    innerData.set(this._hmacInner)
    innerData.set(message, 64)
    const innerHash = sha256(innerData)
    const outerData = new Uint8Array(96)
    outerData.set(this._hmacOuter)
    outerData.set(innerHash, 64)
    return sha256(outerData)
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
    this._initHmacPads()
    
    var age = Date.now() - session.timestamp
    console.log('[Session] Session restored from preserved state (age: ' + (age / 1000).toFixed(1) + 's)')
    return true
  }
  popKeyFromPool() {
    try {
      const data = this.storage.getItem('key_pool')
      if (!data || data.length < 97) {
        if (this.onPoolLow && !this.replenishingPool) {
          this.replenishingPool = true
          this.onPoolLow(15)
        }
        return null
      }
      
      // Binary storage: 97 bytes per key (32 priv + 65 pub)
      const privBytes = binaryStringToBytes(data.slice(0, 32))
      const pubBytes = binaryStringToBytes(data.slice(32, 97))
      const rest = data.slice(97)
      const poolSize = (rest.length / 97) | 0

      rest.length > 0
        ? this.storage.setItem('key_pool', rest)
        : this.storage.removeItem('key_pool')

      if (poolSize < 5 && this.onPoolLow && !this.replenishingPool) {
        this.replenishingPool = true
        this.onPoolLow(15)
      }

      return { privateKeyBytes: privBytes, publicKeyBytes: pubBytes }
    } catch (e) {
      console.log('[Session] popKeyFromPool error:', e.message)
      return null
    }
  }
  completePoolReplenishment() {
    this.replenishingPool = false
  }
  getPoolSize() {
    try {
      const data = this.storage.getItem('key_pool')
      return data ? (data.length / 97) | 0 : 0
    } catch (e) {
      console.log('[Session] getPoolSize error:', e.message)
      return 0
    }
  }
  setPrivateKey(privateKeyBinary, publicKeyBinary) {
    this.enrolledPrivateKey = binaryStringToBytes(privateKeyBinary)
    if (publicKeyBinary) {
      this.enrolledPublicKey = binaryStringToBytes(publicKeyBinary)
    }
  }
  loadVehiclePublicKey() {
    try {
      const pubKeyData = this.storage.getItem('vehicle_ec_public_key')
      if (pubKeyData && pubKeyData.length === 65) {
        // Binary storage: 65 bytes
        this.vehiclePublicKey = binaryStringToBytes(pubKeyData)
        console.log('[SESSION] Loaded vehicle public key from storage (65 bytes)')
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
    if (this._doublingsTable) return this._doublingsTable
    try {
      const data = this.storage.getItem('vehicle_doublings_table')
      if (!data) {
        console.log('[SESSION] Doublings table not found (will use standard ECDH)')
        return null
      }
      if (data.length !== 16384) {
        console.log('[SESSION] Doublings table wrong size: ' + data.length + ' chars (expected 16384)')
        return null
      }
      // Verify first entry matches vehicle public key (read directly from binary string)
      if (this.vehiclePublicKey && this.vehiclePublicKey.length === 65) {
        for (let i = 0; i < 32; i++) {
          if ((data.charCodeAt(i) & 0xff) !== this.vehiclePublicKey[1 + i] ||
              (data.charCodeAt(32 + i) & 0xff) !== this.vehiclePublicKey[33 + i]) {
            console.log('[SESSION] Doublings table is for a different vehicle key — discarding')
            return null
          }
        }
      }
      // Flat Uint32Array(256×16): entry i has x at [i*16..i*16+7], y at [i*16+8..i*16+15]
      // LSW-first convention (matches bytesToU256 in p256.js): word j = bytes at offset 28-j*4
      // Reads directly from binary string — no intermediate Uint8Array or buffer copy
      const table = new Uint32Array(256 * 16)
      for (let i = 0; i < 256; i++) {
        const base = i * 64
        const tbase = i * 16
        for (let j = 0; j < 8; j++) {
          const xo = base + 28 - j * 4
          table[tbase + j] = (((data.charCodeAt(xo)   & 0xff) << 24) |
                               ((data.charCodeAt(xo+1) & 0xff) << 16) |
                               ((data.charCodeAt(xo+2) & 0xff) <<  8) |
                                (data.charCodeAt(xo+3) & 0xff)) >>> 0
          const yo = base + 32 + 28 - j * 4
          table[tbase + 8 + j] = (((data.charCodeAt(yo)   & 0xff) << 24) |
                                   ((data.charCodeAt(yo+1) & 0xff) << 16) |
                                   ((data.charCodeAt(yo+2) & 0xff) <<  8) |
                                    (data.charCodeAt(yo+3) & 0xff)) >>> 0
        }
      }
      console.log('[SESSION] ✓ Loaded precomputed doublings table (256 entries)')
      this._doublingsTable = table
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
              const keyBinary = bytesToBinaryString(self.vehiclePublicKey)
              self.storage.setItem('vehicle_ec_public_key', keyBinary)
              
              console.log('[SESSION] ✓ Got vehicle public key from WhitelistEntryInfo (65 bytes)')
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
    console.log('[SESSION] Popped ephemeral key, pool remaining: ' + this.getPoolSize())
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
    console.log('[SESSION] TX request (first 64 bytes of ' + message.length + ' total bytes)')
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
         console.log('[SESSION] Raw response: ' + result.data.length + ' bytes')

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
              const keyBinary = bytesToBinaryString(response.sessionInfo.publicKey)
              self.storage.setItem('vehicle_ec_public_key', keyBinary)
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
          
          // Log epoch safely
          if (self.epoch && self.epoch.length > 0) {
            console.log('[SESSION] Epoch loaded: ' + self.epoch.length + ' bytes')
          } else {
            console.log('[SESSION] Epoch: <null or empty>')
          }
          
          if (self.vehiclePublicKey) {
            console.log('[SESSION] Vehicle public key: ' + self.vehiclePublicKey.length + ' bytes')
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
          console.log('[SESSION] Starting ECDH (precomputed table)...')
          const _ecdhStart = Date.now()
          const sharedSecret = ecdhFixed(self.ephemeralPrivateKey, _ecdhTable)
          console.log('[SESSION] ECDH done in ' + (Date.now() - _ecdhStart) + 'ms')
          const keyMaterial = sha1(sharedSecret)
          self.sessionKey = keyMaterial.slice(0, 16)
          self._initHmacPads()
          self.established = true
          console.log('[SESSION] ✓ Established: counter=' + self.counter)
          callback({
            success: true,
            counter: self.counter,
            epoch: self.epoch ? self.epoch.length : 0
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
    const hmac = this._hmac(signedMessage)
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
        
        // Track if we received the first response (status push)
        self._waitingForSecondResponse = false
        
        // Use BLE layer's wrapper to handle multi-response  
        teslaBLE.send(message, function(result) {
          if (!result.success) {
            self._waitingForSecondResponse = false
            callback({ success: false, error: result.error })
            return
          }
          try {
            const response = parseRoutableMessage(result.data)
            
            // Vehicle sends two responses: (1) status push (SessionInfo only), (2) action response (with actionStatus)
            if (!response.actionStatus && !self._waitingForSecondResponse) {
              self._waitingForSecondResponse = true
              console.log('[SESSION] Got SessionInfo status push, waiting for action response...')
              // Pass _requeue back through result so BLE wrapper re-registers callback
              result._requeue = true
              callback(result)
              return
            }
            
            // This is the real response with actionStatus, or we already got first response
            self._waitingForSecondResponse = false
            callback({ success: true, response })
          } catch (e) {
            self._waitingForSecondResponse = false
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
    if (this._connecting) {
      this.pendingCallbacks = this.pendingCallbacks || []
      this.pendingCallbacks.push(callback)
      return
    }
    this._connecting = true
    this.pendingCallbacks = [callback]

    this.requestSessionInfo((result) => {
      this._connecting = false
      const callbacks = this.pendingCallbacks
      this.pendingCallbacks = null
      callbacks.forEach(cb => cb(result))
    })
  }
  getStatus() {
    return {
      established: this.established,
      counter: this.counter,
      epoch: this.epoch ? this.epoch.length : 0,
      poolSize: this.getPoolSize()
    }
  }
}
const teslaSession = new TeslaSession()
export { TeslaSession }
export default teslaSession
