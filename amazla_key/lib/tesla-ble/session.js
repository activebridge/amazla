import store from '../store.js'
import teslaBLE from './ble-native.js'
import { binaryStringToBytes } from './crypto/binary-utils.js'
import { ecdhFixed } from './crypto/p256.js'
import { sha1, sha256 } from './crypto/sha256.js'
import { createHmac } from './crypto/hmac.js'
import { decodeMessage } from './protocol/protobuf.js'
import {
  buildInformationRequest,
  buildRoutableMessage,
  buildSessionInfoRequest,
  buildSignatureData,
  buildSignedMessage,
  buildToVCSECMessage,
  buildUnsignedMessage,
  DOMAIN_VEHICLE_SECURITY,
  generateRoutingAddress,
  generateUUID,
  INFO_REQUEST_GET_STATUS,
  INFO_REQUEST_GET_WHITELIST_ENTRY_INFO,
  parseRoutableMessage,
  parseVehicleStatus,
  parseWhitelistEntryInfo,
  RKE_ACTION_LOCK,
  RKE_ACTION_UNLOCK,
} from './protocol/vcsec.js'

const HARDCODED_DEV_VIN = '5YJ3E1EA6JF020598'

class TeslaSession {
  constructor() {
    this.onPoolLow = null // Callback when pool gets low - receives callback(count) to request from phone
    this.reset()
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
    this._connecting = false // guard against duplicate connection attempts
    this.pendingCallbacks = null
    this._doublingsTable = null // cached after first parse; invalidated on reset
    this._hmac = null // instance hmac function for sessionKey
    this._cmdHmacFn = null // instance hmac function for command subKey
    this.vin = null // vehicle VIN as Uint8Array for HMAC personalization
    this._waitingForSecondResponse = false
    if (this._secondResponseTimer) {
      clearTimeout(this._secondResponseTimer)
      this._secondResponseTimer = null
    }
  }
  _initHmacPads() {
    // Precompute HMAC functions for session key and command sub-key
    const { hmac } = createHmac(this.sessionKey)
    // instance-level hmac function (overrides prototype method)
    this._hmac = hmac

    // Command HMAC sub-key — per Tesla SDK:
    //   subKey = HMAC-SHA256(sessionKey, "authenticated command")
    const LABEL = new Uint8Array([
      97, 117, 116, 104, 101, 110, 116, 105, 99, 97, 116, 101, 100, 32, 99, 111, 109, 109, 97, 110, 100,
    ])
    const subKey = this._hmac(LABEL) // 32-byte derived key
    const { hmac: cmdHmac } = createHmac(subKey)
    this._cmdHmacFn = cmdHmac
  }
  // HMAC-SHA256 using the command sub-key (HMAC(sessionKey, "authenticated command")).
  // Used for command authentication per Tesla SDK (AuthorizeHMAC path).
  _cmdHmac(message) {
    if (!this._cmdHmacFn) throw new Error('Command HMAC not initialized')
    return this._cmdHmacFn(message)
  }
  // Builds the HMAC tag for an authenticated command per Tesla SDK metadata scheme.
  // Input: HMAC-SHA256(subKey, metadata || 0xFF || payloadBytes)
  // Metadata TLV fields (tag 1B | len 1B | value):
  //   TAG_SIGNATURE_TYPE(0): HMAC_PERSONALIZED=8
  //   TAG_DOMAIN(1): VEHICLE_SECURITY=2
  //   TAG_PERSONALIZATION(2): VIN bytes (empty if VIN not set)
  //   TAG_EPOCH(3): 16-byte epoch
  //   TAG_EXPIRES_AT(4): uint32 big-endian
  //   TAG_COUNTER(5): uint32 big-endian
  //   TAG_END(0xFF)
  //   payload bytes (ToVCSECMessage)
  _buildHMACTag(epoch, counter, expiresAt, payloadBytes) {
    const vin = this.vin || new Uint8Array(0)
    const epochBytes = epoch instanceof Uint8Array ? epoch : new Uint8Array(0)
    const u32be = (v) => new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff])
    const expiresAtBytes = u32be(expiresAt)
    const counterBytes = u32be(counter)
    const totalLen = 3 + 3 + 2 + vin.length + 2 + epochBytes.length + 6 + 6 + 1 + payloadBytes.length
    const hmacInput = new Uint8Array(totalLen)
    let off = 0
    const wb = (byte) => {
      hmacInput[off++] = byte
    }
    const wBytes = (bytes) => {
      hmacInput.set(bytes, off)
      off += bytes.length
    }
    wb(0x00)
    wb(0x01)
    wb(0x08) // TAG_SIGNATURE_TYPE: HMAC_PERSONALIZED=8
    wb(0x01)
    wb(0x01)
    wb(0x02) // TAG_DOMAIN: VEHICLE_SECURITY=2
    wb(0x02)
    wb(vin.length)
    wBytes(vin) // TAG_PERSONALIZATION: VIN
    wb(0x03)
    wb(epochBytes.length)
    wBytes(epochBytes) // TAG_EPOCH
    wb(0x04)
    wb(0x04)
    wBytes(expiresAtBytes) // TAG_EXPIRES_AT (big-endian)
    wb(0x05)
    wb(0x04)
    wBytes(counterBytes) // TAG_COUNTER (big-endian)
    wb(0xff) // TAG_END
    wBytes(payloadBytes) // payload (ToVCSECMessage bytes)
    return this._cmdHmac(hmacInput)
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
    console.log(`[Session] Session preserved for reconnect (timeout: ${(timeoutMs / 1000).toFixed(1)}s)`)
  }
  isPreserved() {
    if (!this.preserved) return false
    var age = Date.now() - this.preserved.timestamp
    var isValid = age < this.preserved.timeout
    if (!isValid && this.preserved) {
      console.log(`[Session] Preserved session expired (${(age / 1000).toFixed(1)}s old)`)
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
    // Ensure VIN is loaded from storage after restoring a preserved session so
    // HMAC personalization includes the VIN bytes (if stored previously).
    try {
      this.loadVehicleVIN()
    } catch (_e) {
      /* non-fatal */
    }

    var age = Date.now() - session.timestamp
    console.log(`[Session] Session restored from preserved state (age: ${(age / 1000).toFixed(1)}s)`)
    return true
  }
  popKeyFromPool() {
    try {
      const data = store.keyPool
      if (!data || data.length < 97) {
        if (this.onPoolLow && !this.replenishingPool) {
          this.replenishingPool = true
          this.onPoolLow(15)
        }
        return null
      }

      // Binary storage: 97 bytes per key (32 priv + 65 pub)
      const privBytes = data.slice(0, 32)
      const pubBytes = data.slice(32, 97)
      const rest = data.slice(97)
      const poolSize = (rest.length / 97) | 0

      if (rest.length > 0) {
        store.keyPool = rest
      } else {
        store.removeBinary('key_pool')
      }

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
      const data = store.keyPool
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
      const pubKeyData = store.vehicleEcPublicKey
      if (pubKeyData && pubKeyData.length === 65) {
        // Binary storage: 65 bytes
        this.vehiclePublicKey = pubKeyData
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
      const data = store.vehicleDoublingsTable
      if (!data) {
        console.log('[SESSION] Doublings table not found (will use standard ECDH)')
        return null
      }
      if (data.length !== 16384) {
        console.log(`[SESSION] Doublings table wrong size: ${data.length} bytes (expected 16384)`)
        return null
      }
      // Verify first entry matches vehicle public key.
      if (this.vehiclePublicKey && this.vehiclePublicKey.length === 65) {
        for (let i = 0; i < 32; i++) {
          if (data[i] !== this.vehiclePublicKey[1 + i] || data[32 + i] !== this.vehiclePublicKey[33 + i]) {
            console.log('[SESSION] Doublings table is for a different vehicle key — discarding')
            return null
          }
        }
      }
      // Flat Uint32Array(256×16): entry i has x at [i*16..i*16+7], y at [i*16+8..i*16+15]
      // LSW-first convention (matches bytesToU256 in p256.js): word j = bytes at offset 28-j*4
      const table = new Uint32Array(256 * 16)
      for (let i = 0; i < 256; i++) {
        const base = i * 64
        const tbase = i * 16
        for (let j = 0; j < 8; j++) {
          const xo = base + 28 - j * 4
          table[tbase + j] =
            (((data[xo] & 0xff) << 24) |
              ((data[xo + 1] & 0xff) << 16) |
              ((data[xo + 2] & 0xff) << 8) |
              (data[xo + 3] & 0xff)) >>>
            0
          const yo = base + 32 + 28 - j * 4
          table[tbase + 8 + j] =
            (((data[yo] & 0xff) << 24) |
              ((data[yo + 1] & 0xff) << 16) |
              ((data[yo + 2] & 0xff) << 8) |
              (data[yo + 3] & 0xff)) >>>
            0
        }
      }
      console.log('[SESSION] ✓ Loaded precomputed doublings table (256 entries)')
      this._doublingsTable = table
      return table
    } catch (e) {
      console.log(`[SESSION] loadDoublingsTable error: ${e.message}`)
      return null
    }
  }
  loadVehicleVIN() {
    try {
      const vin = store.vehicleVin
      if (vin && vin.length === 17) {
        this.vin = new Uint8Array(vin.length)
        for (let i = 0; i < vin.length; i++) this.vin[i] = vin.charCodeAt(i) & 0x7f
        console.log('[SESSION] Loaded VIN for HMAC personalization')
        return true
      }
      if (vin && vin.length !== 17) {
        console.log(`[SESSION] Stored VIN has invalid length (${vin.length}), expected 17 — replacing with fallback`)
      }
      this.setVehicleVIN(HARDCODED_DEV_VIN)
      console.log('[SESSION] VIN not stored — using hardcoded VIN fallback for HMAC personalization')
      return true
    } catch (_e) {
      this.vin = new Uint8Array(0)
      return false
    }
  }
  setVehicleVIN(vinString) {
    if (!vinString || vinString.length !== 17) {
      throw new Error('VIN must be 17 characters')
    }
    this.vin = new Uint8Array(vinString.length)
    for (let i = 0; i < vinString.length; i++) this.vin[i] = vinString.charCodeAt(i) & 0x7f
    store.vehicleVin = vinString
  }
  requestVehiclePublicKey(callback) {
    const ensureConnectedAndFetch = () => {
      if (teslaBLE.isConnected()) {
        console.log('[SESSION] ✓ BLE connected, requesting vehicle public key')
        doFetch()
        return
      }

      const mac = store.vehicleMac
      if (!mac) {
        callback({ success: false, error: 'Vehicle MAC not found' })
        return
      }

      console.log('[SESSION] Connecting to vehicle for EC key fetch...')
      teslaBLE.disconnect()

      teslaBLE.connect(mac, (result) => {
        if (!result.success) {
          callback({ success: false, error: `BLE connection failed: ${result.error || 'unknown'}` })
          return
        }

        console.log('[SESSION] ✓ Connected, fetching EC key')
        doFetch()
      })
    }

    const doFetch = () => {
      console.log('[SESSION] Requesting vehicle public key via GetWhitelistEntryInfo...')
      const infoRequest = buildInformationRequest(
        INFO_REQUEST_GET_WHITELIST_ENTRY_INFO,
        null,
        null,
        0, // slot 0 = first enrolled key
      )
      const unsignedMsg = buildUnsignedMessage({ informationRequest: infoRequest })
      const signedMsg = buildSignedMessage({ payload: unsignedMsg, signatureType: 2 }) // SIGNATURE_TYPE_PRESENT_KEY
      const toMsg = buildToVCSECMessage(signedMsg)
      const routableMsg = buildRoutableMessage({
        toDomain: DOMAIN_VEHICLE_SECURITY,
        payload: toMsg,
        uuid: generateUUID(),
      })

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
              this.vehiclePublicKey = wlEntryInfo.publicKey
              store.vehicleEcPublicKey = this.vehiclePublicKey

              console.log('[SESSION] ✓ Got vehicle public key from WhitelistEntryInfo (65 bytes)')
              callback({ success: true, vehiclePublicKey: this.vehiclePublicKey })
              return
            }
          }

          console.log('[SESSION] WhitelistEntryInfo response missing field 17 with public key')
          callback({ success: false, error: 'No public key in whitelist entry info' })
        } catch (e) {
          console.log('[SESSION] Error parsing whitelist entry info response:', e.message)
          callback({ success: false, error: `Failed to parse whitelist entry info: ${e.message}` })
        }
      })
    }

    ensureConnectedAndFetch()
  }
  requestSessionInfo(callback) {
    // Early exit if table not available - don't proceed with session at all
    if (!store.vehicleDoublingsTable) {
      console.log('[SESSION] ❌ Doublings table not found - cannot establish session')
      callback({ success: false, error: 'Doublings table not found. Please complete pairing first.' })
      return
    }
    const ensureConnected = () => {
      if (teslaBLE.isConnected()) {
        console.log('[SESSION] ✓ BLE already connected and ready')
        proceedWithSession()
        return
      }

      const mac = store.vehicleMac
      if (!mac) {
        callback({ success: false, error: 'Vehicle MAC not found. Complete pairing first.' })
        return
      }
      const doConnect = (attempt) => {
        console.log(`[SESSION] Connecting to vehicle: ${mac} (attempt ${attempt})`)
        teslaBLE.connect(mac, (result) => {
          console.log('[SESSION] Connect callback fired, result:', JSON.stringify(result))
          if (!result.success) {
            // Retry once on "disconnected during setup" — vehicle needs a moment
            if (attempt === 1 && result.error && result.error.indexOf('disconnected during setup') !== -1) {
              console.log('[SESSION] Vehicle dropped connection during setup, retrying in 2s...')
              setTimeout(() => {
                doConnect(2)
              }, 2000)
              return
            }
            console.log(`[SESSION] ✗ Connection failed: ${result.error || 'unknown'}`)
            callback({ success: false, error: `BLE connection failed: ${result.error || 'unknown'}` })
            return
          }
          console.log('[SESSION] ✓ Connected to vehicle, proceeding')
          proceedWithSession()
        })
      }
      doConnect(1)
    }

    const proceedWithSession = () => {
      if (!this.vehiclePublicKey) {
        this.loadVehiclePublicKey() // Loads from storage if available
        if (!this.vehiclePublicKey) {
          console.log('[SESSION] Vehicle EC key not in storage, attempting to fetch via GetWhitelistEntryInfo...')
          return this.requestVehiclePublicKey((keyResult) => {
            if (keyResult.success) {
              console.log('[SESSION] Successfully obtained vehicle public key, now requesting session info...')
              proceedWithSession()
            } else {
              console.log('[SESSION] Failed to fetch vehicle EC key, continuing with fallback...')
              this._doSessionInfoRequest(callback)
            }
          })
        }
      }
      this._doSessionInfoRequest(callback)
    }

    ensureConnected()
  }
  _doSessionInfoRequest(callback) {
    const keypair = this.popKeyFromPool()
    if (!keypair) {
      callback({ success: false, error: 'Key pool empty — sync from phone (GEN POOL)' })
      return
    }
    console.log(`[SESSION] Popped ephemeral key, pool remaining: ${this.getPoolSize()}`)
    this.ephemeralPrivateKey = keypair.privateKeyBytes // Uint8Array[32]
    this.ephemeralPublicKey = keypair.publicKeyBytes // Uint8Array[65]
    this.routingAddress = generateRoutingAddress()
    const uuid = generateUUID()
    const sessionInfoRequest = buildSessionInfoRequest(
      this.ephemeralPublicKey,
      null, // SessionInfoRequest contains ONLY publicKey; challenge comes from request UUID (field 50)
    )
    const message = buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      routingAddress: this.routingAddress,
      sessionInfoRequest: sessionInfoRequest,
      uuid: uuid,
    })
    console.log(`[SESSION] TX request (first 64 bytes of ${message.length} total bytes)`)
    const sessionInfoResponseHandler = (result) => {
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
        console.log(`[SESSION] Raw response: ${result.data.length} bytes`)

        const response = parseRoutableMessage(result.data)
        console.log(
          `[SESSION] Response fields: sessionInfo=${!!response.sessionInfo}, payload=${!!response.payload}, status=${!!response.signedMessageStatus}`,
        )
        const rawFields = decodeMessage(result.data)
        const fieldKeys = Object.keys(rawFields)
          .sort((a, b) => a - b)
          .join(',')
        console.log(`[SESSION] Raw fields in response: [${fieldKeys}]`)

        // If no sessionInfo, payload, or status — this is an intermediate ack from the vehicle.
        // Signal _requeue so wrappedCallback re-registers sessionInfoResponseHandler for the real response.
        if (!response.sessionInfo && !response.payload && !response.signedMessageStatus) {
          console.log(`[SESSION] Intermediate ack (fields:[${fieldKeys}]), waiting for SessionInfo...`)
          teslaBLE.responseCallback = sessionInfoResponseHandler
          return
        }

        console.log(`[SESSION] RX bytes: ${result.data ? result.data.length : 0}`)
        if (response.sessionInfo) {
          if (response.sessionInfo.publicKey && response.sessionInfo.publicKey.length === 65) {
            this.vehiclePublicKey = response.sessionInfo.publicKey
            console.log('[SESSION] Got vehicle public key from SessionInfo response')
            if (!store.vehicleEcPublicKey) {
              store.vehicleEcPublicKey = response.sessionInfo.publicKey
              console.log('[SESSION] ✓ Saved vehicle public key from SessionInfo as fallback (no pairing key found)')
            }
          } else {
            console.log('[SESSION] SessionInfo response has no valid public key')
            if (!this.vehiclePublicKey) {
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

          // Log epoch safely
          if (this.epoch && this.epoch.length > 0) {
            console.log(`[SESSION] Epoch loaded: ${this.epoch.length} bytes`)
          } else {
            console.log('[SESSION] Epoch: <null or empty>')
          }

          if (this.vehiclePublicKey) {
            console.log(`[SESSION] Vehicle public key: ${this.vehiclePublicKey.length} bytes`)
          } else {
            console.log('[SESSION] ERROR: vehiclePublicKey is null/undefined')
          }
          if (!this.vehiclePublicKey || this.vehiclePublicKey.length !== 65) {
            const actualLength = this.vehiclePublicKey ? this.vehiclePublicKey.length : 0
            console.log(`[SESSION] ❌ INVALID PUBLIC KEY: ${actualLength} bytes, need 65`)
            callback({ success: false, error: `Invalid vehicle public key: ${actualLength} bytes` })
            return
          }
          const _ecdhTable = this.loadDoublingsTable()
          if (!_ecdhTable) {
            callback({ success: false, error: 'No ECDH table — re-pair to generate' })
            return
          }
          console.log('[SESSION] Starting ECDH (precomputed table)...')
          const _ecdhStart = Date.now()
          const sharedSecret = ecdhFixed(this.ephemeralPrivateKey, _ecdhTable)
          console.log(`[SESSION] ECDH done in ${Date.now() - _ecdhStart}ms`)
          const keyMaterial = sha1(sharedSecret)
          this.sessionKey = keyMaterial.slice(0, 16)
          this._initHmacPads()
          this.established = true
          this.loadVehicleVIN()
          console.log(`[SESSION] ✓ Established: counter=${this.counter}`)
          callback({
            success: true,
            counter: this.counter,
            epoch: this.epoch ? this.epoch.length : 0,
          })
        } else {
          const fieldList = Object.keys(rawFields)
            .sort((a, b) => a - b)
            .join(', ')
          console.log('[SESSION] ❌ ERROR: Response missing sessionInfo')
          console.log(`[SESSION] Fields present: [${fieldList}]`)
          callback({ success: false, error: `No session info in response. Fields: [${fieldList}]` })
        }
      } catch (e) {
        console.log(`[SESSION] Exception: ${e.message}`)
        if (e.stack) console.log(`[SESSION] Stack: ${e.stack}`)
        callback({ success: false, error: e.message })
      }
    }
    teslaBLE.send(message, sessionInfoResponseHandler)
  }
  buildAuthenticatedCommand(rkeActionOrClosure) {
    if (!this.established) {
      throw new Error('Session not established')
    }
    this.counter++
    const expiresAt = this.clockTime + 60
    // Build payload: UnsignedMessage → SignedMessage (payload only) → ToVCSECMessage
    // Per vcsec.proto SignedMessage has only field 2 (payload) and field 3 (signatureType).
    // For HMAC commands, signatureType is omitted (NONE=0 default); auth is in RoutableMessage.signature_data.
    let unsignedMessage
    if (typeof rkeActionOrClosure === 'number') {
      unsignedMessage = buildUnsignedMessage({ rkeAction: rkeActionOrClosure })
    } else {
      // Expect rkeActionOrClosure to be an object { closureMoveRequest: <Uint8Array> }
      unsignedMessage = buildUnsignedMessage(rkeActionOrClosure)
    }
    const signedMessage = buildSignedMessage({ payload: unsignedMessage })
    const toVcsec = buildToVCSECMessage(signedMessage)
    // Compute HMAC tag per Tesla SDK (AuthorizeHMAC): HMAC(subKey, metadata || TAG_END || payload)
    // subKey = HMAC(sessionKey, "authenticated command"), precomputed in _initHmacPads
    const tag = this._buildHMACTag(this.epoch, this.counter, expiresAt, toVcsec)
    // SignatureData goes in RoutableMessage field 13 (signature_data)
    const signatureData = buildSignatureData(this.ephemeralPublicKey, this.epoch, this.counter, expiresAt, tag)
    return buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      routingAddress: this.routingAddress,
      payload: toVcsec,
      signatureData,
      uuid: generateUUID(),
    })
  }
  sendCommand(rkeActionOrClosure, callback) {
    const doSend = () => {
      try {
        const message = this.buildAuthenticatedCommand(rkeActionOrClosure)

        // Track if we received the first response (status push)
        this._waitingForSecondResponse = false

        // Use BLE layer's wrapper to handle multi-response
        teslaBLE.send(message, (result) => {
          if (!result.success) {
            this._waitingForSecondResponse = false
            callback({ success: false, error: result.error })
            return
          }
          try {
            const response = parseRoutableMessage(result.data)

            // Vehicle sends two responses: (1) status push (SessionInfo only), (2) action response (with actionStatus)
            if (!response.actionStatus && !this._waitingForSecondResponse) {
              this._waitingForSecondResponse = true
              console.log('[SESSION] Got SessionInfo status push, waiting for action response...')
              // Set a timeout to clear waiting state if second response never arrives
              if (this._secondResponseTimer) clearTimeout(this._secondResponseTimer)
              this._secondResponseTimer = setTimeout(() => {
                if (this._waitingForSecondResponse) {
                  console.log('[SESSION] Second response timeout — clearing waiting state')
                  this._waitingForSecondResponse = false
                  this._secondResponseTimer = null
                  try {
                    callback({ success: false, error: 'Second response timeout' })
                  } catch (_e) {}
                }
              }, 10000)

              // Pass _requeue back through result so BLE wrapper re-registers callback
              result._requeue = true
              callback(result)
              return
            }

            // This is the real response with actionStatus, or we already got first response
            if (this._secondResponseTimer) {
              clearTimeout(this._secondResponseTimer)
              this._secondResponseTimer = null
            }
            this._waitingForSecondResponse = false
            callback({ success: true, response })
          } catch (e) {
            this._waitingForSecondResponse = false
            callback({ success: false, error: e.message })
          }
        })
      } catch (e) {
        callback({ success: false, error: e.message })
      }
    }
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
  sendRKECommand(action, callback) {
    this.sendCommand(action, callback)
  }
  getVehicleStatus(callback) {
    if (!this.established) {
      callback({ success: false, error: 'Session not established' })
      return
    }
    this.counter++
    const expiresAt = this.clockTime + 60
    const unsignedMessage = buildUnsignedMessage({
      informationRequest: buildInformationRequest(INFO_REQUEST_GET_STATUS),
    })
    const signedMessage = buildSignedMessage({ payload: unsignedMessage })
    const toVcsec = buildToVCSECMessage(signedMessage)
    const tag = this._buildHMACTag(this.epoch, this.counter, expiresAt, toVcsec)
    const signatureData = buildSignatureData(this.ephemeralPublicKey, this.epoch, this.counter, expiresAt, tag)
    const message = buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      routingAddress: this.routingAddress,
      payload: toVcsec,
      signatureData,
      uuid: generateUUID(),
    })
    teslaBLE.send(message, (result) => {
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
        console.log(`[SESSION] getVehicleStatus error: ${e.message}`)
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
    return !!store.keyPool && !!store.vehicleEcPublicKey
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
      callbacks.forEach((cb) => cb(result))
    })
  }
  getStatus() {
    return {
      established: this.established,
      counter: this.counter,
      epoch: this.epoch ? this.epoch.length : 0,
      poolSize: this.getPoolSize(),
    }
  }
}
const teslaSession = new TeslaSession()
export { TeslaSession }
export default teslaSession
