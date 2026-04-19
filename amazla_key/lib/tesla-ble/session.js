import store from '../store.js'
import teslaBLE from './ble-native.js'
import { createSessionHmacs, createSessionInfoHmac } from './crypto/hmac.js'
import { ecdhFixed } from './crypto/p256.js'
import { sha1 } from './crypto/sha256.js'
import { decodeMessage } from './protocol/protobuf.js'
import {
  buildHMACTagInput,
  buildInformationRequest,
  buildRoutableMessage,
  buildSessionInfoHmacInput,
  buildSessionInfoRequest,
  buildSignatureData,
  buildSignedMessage,
  buildToVCSECMessage,
  buildUnsignedMessage,
  DOMAIN_VEHICLE_SECURITY,
  generateRoutingAddress,
  generateUUID,
  INFO_REQUEST_GET_STATUS,
  parseRoutableMessage,
  parseVehicleStatus,
  RKE_ACTION_LOCK,
  RKE_ACTION_UNLOCK,
} from './protocol/vcsec.js'

class TeslaSession {
  constructor() {
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
    this._connecting = false // guard against duplicate connection attempts
    this.pendingCallbacks = null
    this._cmdHmacFn = null
    this._lastRequestUuid = null
    this._waitingForSecondResponse = false
    if (this._secondResponseTimer) {
      clearTimeout(this._secondResponseTimer)
      this._secondResponseTimer = null
    }
  }
  _buildHMACTag(epoch, counter, expiresAt, payloadBytes) {
    if (!this._cmdHmacFn) throw new Error('Command HMAC not initialized')
    return this._cmdHmacFn(buildHMACTagInput(store.vehicleVin || new Uint8Array(0), epoch, counter, expiresAt, payloadBytes))
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
        this.vehiclePublicKey = store.vehicleEcPublicKey || null
        if (!this.vehiclePublicKey) {
          callback({ success: false, error: 'Vehicle EC key missing — re-pair via phone' })
          return
        }
      }
      this._doSessionInfoRequest(callback)
    }

    ensureConnected()
  }
  _doSessionInfoRequest(callback) {
    const keypair = store.popKey()
    if (!keypair) {
      callback({ success: false, error: 'Key pool empty — sync from phone (GEN POOL)' })
      return
    }
    console.log(`[SESSION] Popped ephemeral key, pool remaining: ${store.keyPoolCount}`)
    this.ephemeralPrivateKey = keypair.privateKeyBytes // Uint8Array[32]
    this.ephemeralPublicKey = keypair.publicKeyBytes // Uint8Array[65]
    this.routingAddress = generateRoutingAddress()
    const uuid = generateUUID()
    this._lastRequestUuid = uuid
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

        const rawFields = decodeMessage(result.data)
        const fieldKeys = Object.keys(rawFields)
          .sort((a, b) => a - b)
          .join(',')
        const response = parseRoutableMessage(result.data)

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
            if (!this.vehiclePublicKey) this.vehiclePublicKey = store.vehicleEcPublicKey || null
            if (!this.vehiclePublicKey) {
              console.log('[SESSION] ❌ No vehicle public key available from storage or response')
              callback({ success: false, error: 'Vehicle public key not found. Complete pairing first.' })
              return
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
          const _ecdhTable = store.vehicleDoublingsTable
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

          // Verify SessionInfo HMAC tag before trusting session state.
          if (!response.sessionInfoTag) {
            console.log('[SESSION] ❌ Unauthenticated SessionInfo (no tag)')
            callback({ success: false, error: 'Unauthenticated SessionInfo response' })
            return
          }
          const infoHmac = createSessionInfoHmac(this.sessionKey)
          const expectedTag = infoHmac(
            buildSessionInfoHmacInput(
              store.vehicleVin || new Uint8Array(0),
              this._lastRequestUuid || new Uint8Array(0),
              response.sessionInfoBytes,
            ),
          )
          if (expectedTag.length !== response.sessionInfoTag.length) {
            console.log('[SESSION] ❌ SessionInfo HMAC length mismatch')
            callback({ success: false, error: 'Invalid SessionInfo HMAC' })
            return
          }
          let diff = 0
          for (let i = 0; i < expectedTag.length; i++) diff |= expectedTag[i] ^ response.sessionInfoTag[i]
          if (diff !== 0) {
            console.log('[SESSION] ❌ SessionInfo HMAC mismatch')
            callback({ success: false, error: 'Invalid SessionInfo HMAC' })
            return
          }
          console.log('[SESSION] ✓ SessionInfo tag verified')

          const { cmdHmac } = createSessionHmacs(this.sessionKey)
          this._cmdHmacFn = cmdHmac
          this.established = true
          console.log(`[SESSION] ✓ Established: counter=${this.counter}`)
          callback({
            success: true,
            counter: this.counter,
            epoch: this.epoch ? this.epoch.length : 0,
          })
        } else {
          console.log('[SESSION] ❌ ERROR: Response missing sessionInfo')
          console.log(`[SESSION] Fields present: [${fieldKeys}]`)
          callback({ success: false, error: `No session info in response. Fields: [${fieldKeys}]` })
        }
      } catch (e) {
        console.log(`[SESSION] Exception: ${e.message}`)
        if (e.stack) console.log(`[SESSION] Stack: ${e.stack}`)
        callback({ success: false, error: e.message })
      }
    }
    teslaBLE.send(message, sessionInfoResponseHandler)
  }
  // Shared auth message builder: counter++, HMAC tag, SignatureData, RoutableMessage.
  // Takes a pre-built UnsignedMessage; returns the RoutableMessage bytes ready to send.
  _buildAuthMessage(unsignedMessage) {
    this.counter++
    const expiresAt = this.clockTime + 60
    const signedMessage = buildSignedMessage({ payload: unsignedMessage })
    const toVcsec = buildToVCSECMessage(signedMessage)
    const tag = this._buildHMACTag(this.epoch, this.counter, expiresAt, toVcsec)
    const signatureData = buildSignatureData(this.ephemeralPublicKey, this.epoch, this.counter, expiresAt, tag)
    return buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      routingAddress: this.routingAddress,
      payload: toVcsec,
      signatureData,
      uuid: generateUUID(),
    })
  }
  buildAuthenticatedCommand(rkeActionOrClosure) {
    if (!this.established) {
      throw new Error('Session not established')
    }
    // Per vcsec.proto SignedMessage has only field 2 (payload) and field 3 (signatureType).
    // For HMAC commands, signatureType is omitted (NONE=0 default); auth is in RoutableMessage.signature_data.
    const unsignedMessage =
      typeof rkeActionOrClosure === 'number'
        ? buildUnsignedMessage({ rkeAction: rkeActionOrClosure })
        : buildUnsignedMessage(rkeActionOrClosure) // { closureMoveRequest: <Uint8Array> }
    return this._buildAuthMessage(unsignedMessage)
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

            // Vehicle sends up to two responses per authenticated command:
            //   1. SessionInfo-only push (field 15) — updates counter/epoch/clock
            //   2. FromVCSECMessage (field 10) or auth-fault (field 12) — terminal
            // Treat "no commandStatus and no signedMessageStatus" as first-response waiting.
            const isTerminal = !!(response.commandStatus || response.signedMessageStatus)
            if (!isTerminal && !this._waitingForSecondResponse) {
              this._waitingForSecondResponse = true
              console.log('[SESSION] Got SessionInfo status push, waiting for action response...')
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

            if (this._secondResponseTimer) {
              clearTimeout(this._secondResponseTimer)
              this._secondResponseTimer = null
            }
            this._waitingForSecondResponse = false

            // Auth-layer fault (counter/epoch mismatch, invalid signature, etc.)
            const mFault = response.signedMessageStatus && response.signedMessageStatus.signedMessageFault
            if (mFault) {
              callback({ success: false, error: `Signed message fault ${mFault}`, response })
              return
            }
            // VCSEC-level ERROR (command rejected — obstruction, unauthorized, etc.)
            if (response.commandStatus && response.commandStatus.operationStatus === 2) {
              callback({ success: false, error: 'Command rejected by vehicle', response })
              return
            }
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
      this.ensureSessionEstablished((result) => {
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
  getVehicleStatus(callback) {
    if (!this.established) {
      callback({ success: false, error: 'Session not established' })
      return
    }
    const unsignedMessage = buildUnsignedMessage({
      informationRequest: buildInformationRequest(INFO_REQUEST_GET_STATUS),
    })
    const message = this._buildAuthMessage(unsignedMessage)
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
        const vehicleStatus = parseVehicleStatus(response.vehicleStatus)
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
  ensureSessionEstablished(callback) {
    // If session already established, call callback immediately
    if (this.established) {
      callback({ success: true })
      return
    }
    // If not paired yet, return error
    if (!store.isPaired) {
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
}
const teslaSession = new TeslaSession()
export { TeslaSession }
export default teslaSession
