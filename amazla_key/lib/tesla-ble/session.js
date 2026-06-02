import Phone from '../phone.js'
import store from '../store.js'
import teslaBLE from './ble.js'
import { computeTeslaBLEName } from './ble-name.js'
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
    // No table check here anymore — _ensureTableForVehiclePub will build it
    // on the fly from the SessionInfo response if missing or stale.
    this._ensureConnected(callback)
  }
  _ensureConnected(callback) {
    if (teslaBLE.isConnected()) {
      console.log('[SESSION] ✓ BLE already connected and ready')
      this._proceedWithSession(callback)
      return
    }
    const vinBytes = store.vehicleVin
    if (!vinBytes || vinBytes.length === 0) {
      callback({ success: false, error: 'VIN not set. Complete pairing first.' })
      return
    }
    let vinStr = ''
    try { for (let i = 0; i < vinBytes.length; i++) vinStr += String.fromCharCode(vinBytes[i]) } catch (_e) {}
    console.log(`[SESSION] VIN bytes (${vinBytes.length}B): "${vinStr}"`)
    console.log(`[SESSION] Saved MAC (cached hint): ${store.vehicleMac || '<none>'}`)
    console.log(`[SESSION] EC pubkey: ${store.vehicleEcPublicKey ? store.vehicleEcPublicKey.length + 'B present' : '<absent>'}`)
    console.log(`[SESSION] Doublings table: ${store.vehicleDoublingsTable ? 'present' : '<absent>'}`)
    console.log(`[SESSION] Key pool count: ${store.keyPoolCount}`)
    // Tesla rotates the BLE MAC every ~15 min. The MAC in store.vehicleMac
    // may already be stale. Mirror the Tesla Go SDK's VehicleLocalName flow:
    // derive the BLE local name from VIN, scan for an exact-name advertisement,
    // dial whatever MAC the current beacon reports. See README "Scan-by-name
    // on every connect (Tesla MAC rotation)" for the full rationale.
    const expectedName = computeTeslaBLEName(vinBytes)
    if (!expectedName) {
      callback({ success: false, error: 'Could not derive BLE name from VIN.' })
      return
    }
    console.log(`[SESSION] Derived Tesla BLE name from VIN: ${expectedName}`)
    this._scanThenConnect(expectedName, callback)
  }
  _scanThenConnect(expectedName, callback) {
    console.log(`[SESSION] Scanning for ${expectedName} (Tesla MAC rotates; saved MAC may be stale)...`)
    let foundMAC = null
    teslaBLE.scan((r) => {
      if (r.type === 'found' && !foundMAC) {
        foundMAC = r.device.mac
        teslaBLE.stopScan()
        const savedMAC = store.vehicleMac
        if (savedMAC !== foundMAC) {
          console.log(`[SESSION] BLE address rotated: ${savedMAC || '(none)'} → ${foundMAC}`)
          store.vehicleMac = foundMAC
        } else {
          console.log(`[SESSION] BLE address unchanged: ${foundMAC}`)
        }
        // Give the scan a beat to fully tear down before dialing — observed
        // races where mstConnect silently hangs when issued back-to-back.
        setTimeout(() => this._doConnect(foundMAC, 1, callback), 200)
      }
      if (r.type === 'complete' && !foundMAC) {
        console.log(`[SESSION] ✗ ${expectedName} not in BLE range`)
        callback({
          success: false,
          error: 'Vehicle not in BLE range. Wake the car (touch a door handle) and retry.',
        })
      }
    }, 8000, expectedName)
  }
  _doConnect(mac, _attempt, callback) {
    console.log(`[SESSION] Dialing vehicle: ${mac}`)
    teslaBLE.connect(mac, (result) => {
      console.log('[SESSION] Connect callback fired, result:', JSON.stringify(result))
      if (!result.success) {
        console.log(`[SESSION] ✗ Connection failed: ${result.error || 'unknown'}`)
        callback({ success: false, error: `BLE connection failed: ${result.error || 'unknown'}` })
        return
      }
      console.log('[SESSION] ✓ Connected to vehicle, proceeding')
      this._proceedWithSession(callback)
    })
  }
  _proceedWithSession(callback) {
    // Stored vehicle pubkey isn't required at this point — SessionInfo will
    // include the real one, and _ensureTableForVehiclePub builds the table
    // from it (rebuilding if the stored key has changed). On first connect
    // after pair, both stored pubkey and table will be absent; that's OK.
    if (!this.vehiclePublicKey && store.vehicleEcPublicKey) {
      this.vehiclePublicKey = store.vehicleEcPublicKey
    }
    this._doSessionInfoRequest(callback)
  }
  _doSessionInfoRequest(callback) {
    // Tesla protocol (mirrors vehicle-command Go SDK `Session.localKey`): the
    // *same* long-term enrolled keypair is used for both SessionInfoRequest
    // identity and ECDH. Sending an ephemeral key here makes the vehicle
    // respond with SessionInfo{status:KEY_NOT_ON_WHITELIST=1} because only
    // the enrolled key is in its whitelist.
    const watchPriv = store.watchPrivateKey
    const watchPub = store.watchPublicKey
    const hx = (b) => { if (!b) return '<null>'; let s=''; for (let i=0;i<b.length;i++){ const h=(b[i]&0xff).toString(16); s += h.length<2?'0'+h:h } return s }
    console.log(`[SESSION.diag] watchPriv hex=${hx(watchPriv)}`)
    console.log(`[SESSION.diag] watchPub  hex=${hx(watchPub)}`)
    if (!watchPriv || watchPriv.length !== 32 || !watchPub || watchPub.length !== 65) {
      callback({ success: false, error: 'Watch keypair missing — re-pair from phone' })
      return
    }
    this.ephemeralPrivateKey = watchPriv // long-term, name kept for crypto-path compat
    this.ephemeralPublicKey = watchPub
    this.routingAddress = generateRoutingAddress()
    this._lastRequestUuid = generateUUID()

    const message = buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      routingAddress: this.routingAddress,
      // SessionInfoRequest.publicKey = enrolled long-term key (vehicle looks
      // up its whitelist by this). Challenge comes from request UUID (field 50).
      sessionInfoRequest: buildSessionInfoRequest(this.ephemeralPublicKey, null),
      uuid: this._lastRequestUuid,
    })
    console.log(`[SESSION] TX request (first 64 bytes of ${message.length} total bytes)`)

    const handler = (result) => this._handleSessionInfoResponse(result, callback, handler)
    teslaBLE.send(message, handler)
  }
  _handleSessionInfoResponse(result, callback, handler) {
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

      const fieldKeys = Object.keys(decodeMessage(result.data))
        .sort((a, b) => a - b)
        .join(',')
      const response = parseRoutableMessage(result.data)

      // Distinct, actionable error before the generic "intermediate ack" check.
      // SessionInfoStatus=1 (KEY_NOT_ON_WHITELIST) means the vehicle doesn't
      // recognize our identity key — re-pairing is the only recovery. Disconnect
      // BLE immediately so the vehicle's slot frees up instead of waiting for
      // its supervision timeout (observed >6 min on Model 3).
      if (response.sessionInfoStatus === 1) {
        console.log('[SESSION] ❌ Vehicle rejected key: KEY_NOT_ON_WHITELIST — re-pair required')
        try { teslaBLE.disconnect() } catch (_e) {}
        callback({ success: false, error: 'Key not on vehicle whitelist — re-pair from phone' })
        return
      }

      // Intermediate ack from vehicle: no sessionInfo, payload, or status. Re-register for the real response.
      if (!response.sessionInfo && !response.payload && !response.signedMessageStatus) {
        console.log(`[SESSION] Intermediate ack (fields:[${fieldKeys}]), waiting for SessionInfo...`)
        teslaBLE.responseCallback = handler
        return
      }

      console.log(`[SESSION] RX bytes: ${result.data ? result.data.length : 0}`)
      if (!response.sessionInfo) {
        console.log('[SESSION] ❌ ERROR: Response missing sessionInfo')
        console.log(`[SESSION] Fields present: [${fieldKeys}]`)
        try { teslaBLE.disconnect() } catch (_e) {}
        callback({ success: false, error: `No session info in response. Fields: [${fieldKeys}]` })
        return
      }
      this._processSessionInfo(response, callback)
    } catch (e) {
      console.log(`[SESSION] Exception: ${e.message}`)
      if (e.stack) console.log(`[SESSION] Stack: ${e.stack}`)
      callback({ success: false, error: e.message })
    }
  }
  _processSessionInfo(response, callback) {
    if (response.sessionInfo.publicKey && response.sessionInfo.publicKey.length === 65) {
      this.vehiclePublicKey = response.sessionInfo.publicKey
      console.log('[SESSION] Got vehicle public key from SessionInfo response')
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

    if (this.epoch && this.epoch.length > 0) {
      console.log(`[SESSION] Epoch loaded: ${this.epoch.length} bytes`)
    } else {
      console.log('[SESSION] Epoch: <null or empty>')
    }
    console.log(`[SESSION] Vehicle public key: ${this.vehiclePublicKey.length} bytes`)
    if (this.vehiclePublicKey.length !== 65) {
      console.log(`[SESSION] ❌ INVALID PUBLIC KEY: ${this.vehiclePublicKey.length} bytes, need 65`)
      callback({ success: false, error: `Invalid vehicle public key: ${this.vehiclePublicKey.length} bytes` })
      return
    }

    this._ensureTableForVehiclePub((err) => {
      if (err) { callback({ success: false, error: err }); return }
      if (!this._deriveSessionKey(callback)) return
      if (!this._verifySessionInfoTag(response, callback)) return
      const { cmdHmac } = createSessionHmacs(this.sessionKey)
      this._cmdHmacFn = cmdHmac
      this.established = true
      console.log(`[SESSION] ✓ Established: counter=${this.counter}`)
      callback({ success: true, counter: this.counter, epoch: this.epoch ? this.epoch.length : 0 })
    })
  }
  // Build/refresh the doublings table on phone when the vehicle's SessionInfo
  // pubkey differs from what's stored (or nothing is stored). The pair
  // response's field 17 does NOT contain the vehicle's runtime EC key (it's a
  // signer/admin key from WhitelistInfo), so the table must come from a live
  // SessionInfo pubkey. Matches Tesla Go SDK.
  // Calls done(err|null).
  _ensureTableForVehiclePub(done) {
    const hx = (b) => { if (!b) return '<null>'; let s=''; for (let i=0;i<b.length;i++){ const h=(b[i]&0xff).toString(16); s += h.length<2?'0'+h:h } return s }
    const sessionPub = this.vehiclePublicKey
    const stored = store.vehicleEcPublicKey
    const sameKey = stored && stored.length === 65 && hx(stored) === hx(sessionPub)
    if (sameKey && store.hasDoublingsTable) {
      done(null)
      return
    }
    console.log('[SESSION] vehicle pub changed (or no table) — rebuilding doublings table on phone')
    console.log('[SESSION.diag] sessionInfo.publicKey hex=' + hx(sessionPub))
    console.log('[SESSION.diag] store.vehicleEcPublicKey hex=' + hx(stored))
    const phone = new Phone()
    phone.precomputeTable(sessionPub)
      .then((tableBytes) => {
        if (!tableBytes || tableBytes.length !== 16384) {
          done('Bad doublings table size: ' + (tableBytes ? tableBytes.length : 'null'))
          return
        }
        store.vehicleEcPublicKey = sessionPub
        store.vehicleDoublingsTable = tableBytes
        console.log('[SESSION] ✓ Doublings table rebuilt and saved (' + tableBytes.length + ' bytes)')
        done(null)
      })
      .catch((e) => {
        console.log('[SESSION] ❌ precomputeTable failed: ' + (e && e.message))
        done('precomputeTable failed: ' + (e && e.message))
      })
  }
  _deriveSessionKey(callback) {
    const ecdhTable = store.vehicleDoublingsTable
    if (!ecdhTable) {
      callback({ success: false, error: 'No ECDH table — re-pair to generate' })
      return false
    }
    console.log('[SESSION] Starting ECDH (precomputed table)...')
    const start = Date.now()
    const sharedSecret = ecdhFixed(this.ephemeralPrivateKey, ecdhTable)
    console.log(`[SESSION] ECDH done in ${Date.now() - start}ms`)
    this.sessionKey = sha1(sharedSecret).slice(0, 16)
    return true
  }
  _verifySessionInfoTag(response, callback) {
    const hx = (b, n) => {
      if (!b) return '<null>'
      const len = n === undefined ? b.length : Math.min(n, b.length)
      let s = ''
      for (let i = 0; i < len; i++) { const h = (b[i] & 0xff).toString(16); s += h.length < 2 ? '0' + h : h }
      return s
    }
    if (!response.sessionInfoTag) {
      console.log('[SESSION] ❌ Unauthenticated SessionInfo (no tag)')
      callback({ success: false, error: 'Unauthenticated SessionInfo response' })
      return false
    }
    const vin = store.vehicleVin || new Uint8Array(0)
    const challenge = this._lastRequestUuid || new Uint8Array(0)
    const infoBytes = response.sessionInfoBytes
    const infoHmac = createSessionInfoHmac(this.sessionKey)
    const expectedTag = infoHmac(buildSessionInfoHmacInput(vin, challenge, infoBytes))
    console.log(`[SESSION.diag] sessionKey[0..4]=${hx(this.sessionKey, 4)} vinLen=${vin.length} challengeLen=${challenge.length} infoLen=${infoBytes ? infoBytes.length : 0}`)
    console.log(`[SESSION.diag] expectedTag[0..4]=${hx(expectedTag, 4)} got=${hx(response.sessionInfoTag, 4)} lens exp=${expectedTag.length} got=${response.sessionInfoTag.length}`)
    if (expectedTag.length !== response.sessionInfoTag.length) {
      console.log('[SESSION] ❌ SessionInfo HMAC length mismatch')
      callback({ success: false, error: 'Invalid SessionInfo HMAC' })
      return false
    }
    let diff = 0
    for (let i = 0; i < expectedTag.length; i++) diff |= expectedTag[i] ^ response.sessionInfoTag[i]
    if (diff !== 0) {
      console.log('[SESSION] ❌ SessionInfo HMAC mismatch')
      console.log(`[SESSION.diag] challenge=${hx(challenge)}`)
      console.log(`[SESSION.diag] vin=${hx(vin)}`)
      console.log(`[SESSION.diag] infoBytes=${hx(infoBytes)}`)
      console.log(`[SESSION.diag] expectedTag=${hx(expectedTag)}`)
      console.log(`[SESSION.diag] gotTag=${hx(response.sessionInfoTag)}`)
      callback({ success: false, error: 'Invalid SessionInfo HMAC' })
      return false
    }
    console.log('[SESSION] ✓ SessionInfo tag verified')
    return true
  }
  // Shared auth message builder: counter++, HMAC tag, SignatureData, RoutableMessage.
  // Takes a pre-built UnsignedMessage; returns the RoutableMessage bytes ready to send.
  _buildAuthMessage(unsignedMessage) {
    this.counter++
    const expiresAt = this.clockTime + 60
    // RoutableMessage.protobuf_message_as_bytes for a VCSEC HMAC command IS the
    // vcsec.UnsignedMessage itself — NOT wrapped in ToVCSECMessage/SignedMessage.
    // (Tesla SDK executeRKEAction marshals UnsignedMessage directly and passes it
    // straight to the routable payload.) The old double-wrapping meant the vehicle
    // parsed field 1 of our ToVCSECMessage as UnsignedMessage.InformationRequest,
    // so it replied with VehicleStatus and never executed the RKE action — and gave
    // no fault, because the HMAC still matched the bytes we sent. The HMAC must cover
    // the same bytes we put in the payload: the UnsignedMessage.
    const tag = this._buildHMACTag(this.epoch, this.counter, expiresAt, unsignedMessage)
    const signatureData = buildSignatureData(this.ephemeralPublicKey, this.epoch, this.counter, expiresAt, tag)
    return buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      routingAddress: this.routingAddress,
      payload: unsignedMessage,
      signatureData,
      uuid: generateUUID(),
    })
  }
  buildAuthenticatedCommand(rkeActionOrClosure) {
    if (!this.established) {
      throw new Error('Session not established')
    }
    // For HMAC commands the payload is a bare vcsec.UnsignedMessage; auth rides in
    // RoutableMessage.signature_data. No SignedMessage/ToVCSECMessage wrapper.
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

            // Tesla streams unsolicited pushes (periodic VehicleStatus etc.) on the
            // same characteristic. They're addressed to a domain, not our routing
            // address, so they'd otherwise be consumed as the command's response and
            // steal a response slot. Drop them and keep listening.
            const ra = this.routingAddress
            const dst = response.toRoutingAddress
            const addressedToUs = ra && dst && dst.length === ra.length && (() => {
              for (let i = 0; i < ra.length; i++) if (ra[i] !== dst[i]) return false
              return true
            })()
            if (!addressedToUs) {
              console.log('[SESSION] Ignoring unsolicited push (not addressed to this command)')
              result._requeue = true
              callback(result)
              return
            }

            // Vehicle sends up to two responses per authenticated command:
            //   1. SessionInfo-only push (field 15) — updates counter/epoch/clock
            //   2. FromVCSECMessage (field 10) or auth-fault (field 12) — terminal
            // Treat "no commandStatus and no signedMessageStatus" as first-response waiting.
            // NOTE: a bare vehicleStatus reply is NOT treated as success — the car
            // returns one even when it accepts-but-does-not-actuate a command (no
            // commandStatus), so claiming success on it would be a lie.
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
