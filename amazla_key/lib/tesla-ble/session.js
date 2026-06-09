import Phone from '../phone.js'
import store from '../store.js'
import teslaBLE from './ble.js'
import { computeTeslaBLEName } from './ble-name.js'
import { createSessionHmacs, createSessionInfoHmac } from './crypto/hmac.js'
import { sha1, sha256 } from './crypto/sha256.js'
import { hexDump } from './crypto/binary-utils.js'
import { decodeMessage } from './protocol/protobuf.js'
import {
  buildClosureMoveRequest,
  buildHMACTagInput,
  buildInformationRequest,
  buildRoutableMessage,
  buildSessionInfoHmacInput,
  CLOSURE_FRUNK,
  CLOSURE_MOVE_OPEN,
  CLOSURE_REAR_TRUNK,
  buildSessionInfoRequest,
  buildSignatureData,
  buildUnsignedMessage,
  buildAuthenticationResponse,
  buildAppDeviceInfo,
  AUTH_LEVEL_UNLOCK,
  APP_OS_ANDROID,
  UWB_UNSUPPORTED,
  DOMAIN_VEHICLE_SECURITY,
  generateRoutingAddress,
  generateUUID,
  INFO_REQUEST_GET_STATUS,
  parseRoutableMessage,
  parseVehicleStatus,
  RKE_ACTION_LOCK,
  RKE_ACTION_UNLOCK,
  RKE_ACTION_REMOTE_DRIVE,
} from './protocol/vcsec.js'

// DIAGNOSTIC: dump a full RX frame so a handle-pull / proximity-auth frame the
// car pushes is visible regardless of which path catches it — idle listener OR
// mid-command (where unaddressed frames are otherwise silently dropped). Remove
// once we know whether the car solicits the watch on handle-pull.
const hx = hexDump
const dumpRxFrame = (tag, raw, response) => {
  try {
    const topKeys = Object.keys(decodeMessage(raw)).sort((a, b) => a - b).join(',')
    console.log(`[RX-DUMP ${tag}] ${raw.length}B fields:[${topKeys}] hex=${hx(raw)}`)
    console.log(`[RX-DUMP ${tag}]   toRoutingAddress=${response.toRoutingAddress ? hx(response.toRoutingAddress) : '<none>'} sessionInfo=${response.sessionInfo ? 'present' : '<none>'} payload=${response.payload ? response.payload.length + 'B' : '<none>'} vehicleStatus=${response.vehicleStatus ? response.vehicleStatus.length + 'B' : '<none>'} signedMsgStatus=${response.signedMessageStatus ? JSON.stringify(response.signedMessageStatus) : '<none>'} commandStatus=${response.commandStatus ? JSON.stringify(response.commandStatus) : '<none>'}`)
    if (response.payload) {
      try {
        const inner = decodeMessage(response.payload)
        console.log(`[RX-DUMP ${tag}]   FromVCSECMessage inner fields:[${Object.keys(inner).sort((a, b) => a - b).join(',')}]`)
      } catch (_e) {}
    }
    if (response.authenticationRequest) {
      const a = response.authenticationRequest
      console.log(`[RX-DUMP ${tag}]   AuthenticationRequest level=${a.requestedLevel} reasons=[${a.reasonsForAuth}] token=${a.token ? hx(a.token) : '<none>'}`)
    }
  } catch (e) {
    console.log(`[RX-DUMP ${tag}] dump error: ${e.message}`)
  }
}

// Recovery when a SessionInfoRequest gets only ambient (fields:[3]) broadcasts
// and no real SessionInfo. Leading cause is a dropped request chunk (unacked
// WRITE_WITHOUT_RESPONSE under notification congestion → car gets a truncated
// request, never replies). Two tiers, cheapest first:
//
//   Tier 0 — resend the request on the SAME live link (a dropped chunk just
//     needs another complete copy; no teardown). Up to RESENDS_PER_CONNECT.
//   Tier 1 — recycle the link (disconnect + native flush + settle + reconnect),
//     up to MAX_CONNECTS total connections, then give up.
//
// Healthy SessionInfo arrives ~1.2s after TX, so these windows are "lost, not
// slow". The first window per connection is longer to also clear the uuid-race
// (a slow legit reply to the prior uuid mustn't be mistaken for lost) and to
// tolerate the car's ambient-before-reply chatter.
const SESSION_INFO_AMBIENT_TIMEOUT_MS = 5000
const SESSION_INFO_RESEND_TIMEOUT_MS = 3000
const SESSION_INFO_RESENDS_PER_CONNECT = 2
const SESSION_INFO_MAX_CONNECTS = 2
// Idle gap between tearing down the link and reconnecting on a Tier-1 recycle.
// Lets the native BLE stack drain queued RX (stale notification fragments) while
// nothing is attached — a back-to-back reconnect reuses that dirty state.
const RECYCLE_SETTLE_MS = 600
// Overall deadline for an authenticated command, covering the cases the
// per-second-response timer (_secondResponseTimer) does NOT: the vehicle never
// replies at all, or only streams unsolicited pushes. A dropped command write
// (unacked WRITE_WITHOUT_RESPONSE) would otherwise leave the callback pending
// forever — wedging the caller's busy flag with no error and no recovery.
const COMMAND_TIMEOUT_MS = 15000

class TeslaSession {
  constructor() {
    this.reset()
    // Watchdog timing — instance fields (default from the consts above) so tests
    // can shrink them for fast, deterministic recovery-path coverage. Set in the
    // constructor (not reset()) so they survive session.reset().
    this.sessionInfoAmbientTimeoutMs = SESSION_INFO_AMBIENT_TIMEOUT_MS
    this.sessionInfoResendTimeoutMs = SESSION_INFO_RESEND_TIMEOUT_MS
    this.recycleSettleMs = RECYCLE_SETTLE_MS
    this.commandTimeoutMs = COMMAND_TIMEOUT_MS
  }
  reset() {
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
    this._sessionInfoResends = 0  // Tier-0 resends done on the current connection
    this._sessionInfoConnects = 0 // connections established this requestSessionInfo
    this._statusPushHandler = null
    this._clearSessionInfoTimer()
    this._clearCommandTimer()
  }
  _clearSessionInfoTimer() {
    if (this._sessionInfoTimer) {
      clearTimeout(this._sessionInfoTimer)
      this._sessionInfoTimer = null
    }
  }
  _clearCommandTimer() {
    if (this._commandTimer) {
      clearTimeout(this._commandTimer)
      this._commandTimer = null
    }
  }
  _buildHMACTag(epoch, counter, expiresAt, payloadBytes) {
    if (!this._cmdHmacFn) throw new Error('Command HMAC not initialized')
    return this._cmdHmacFn(buildHMACTagInput(store.vehicleVin || new Uint8Array(0), epoch, counter, expiresAt, payloadBytes))
  }
  requestSessionInfo(callback) {
    // No key material needed up front — the session key is derived (or the cached
    // one validated) from the SessionInfo response in _processSessionInfo.
    this._sessionInfoResends = 0
    this._sessionInfoConnects = 0
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
    console.log(`[SESSION] Cached session key: ${store.sessionKey ? 'present' : '<absent>'}`)
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
    // include the real one, and _processSessionInfo uses it to validate the
    // cached session key (or re-derive via the phone if the key changed). On
    // first connect after pair, both stored pubkey and cached key are absent;
    // that's OK — the slow path derives and caches them.
    if (!this.vehiclePublicKey && store.vehicleEcPublicKey) {
      this.vehiclePublicKey = store.vehicleEcPublicKey
    }
    // Each (re)connect is one connection; reset the per-connection resend count.
    this._sessionInfoConnects++
    this._sessionInfoResends = 0
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
    console.log(`[SESSION.diag] watchPriv hex=${hx(watchPriv)}`)
    console.log(`[SESSION.diag] watchPub  hex=${hx(watchPub)}`)
    if (!watchPriv || watchPriv.length !== 32 || !watchPub || watchPub.length !== 65) {
      callback({ success: false, error: 'Watch keypair missing — re-pair from phone' })
      return
    }
    // watchPriv validated above (re-pair guard); the ECDH itself runs on the
    // phone, so the watch never needs the private key past this point.
    this.ephemeralPublicKey = watchPub // long-term key; name kept for crypto-path compat
    this.routingAddress = generateRoutingAddress()
    this._lastRequestUuid = generateUUID()

    const message = buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      routingAddress: this.routingAddress,
      // SessionInfoRequest.publicKey = enrolled long-term key (vehicle looks
      // up its whitelist by this). Challenge is the request uuid in field 51
      // (see buildRoutableMessage) — the vehicle HMACs SessionInfo over it.
      sessionInfoRequest: buildSessionInfoRequest(this.ephemeralPublicKey, null),
      uuid: this._lastRequestUuid,
    })
    // First send of a connection gets the longer window; a resend (we already
    // know the link is slow) gets the shorter one.
    const timeout = this._sessionInfoResends === 0 ? this.sessionInfoAmbientTimeoutMs : this.sessionInfoResendTimeoutMs
    console.log(`[SESSION] TX request (connect ${this._sessionInfoConnects}/${SESSION_INFO_MAX_CONNECTS}, resend ${this._sessionInfoResends}/${SESSION_INFO_RESENDS_PER_CONNECT}, ${message.length}B, ${timeout}ms window)`)

    const handler = (result) => this._handleSessionInfoResponse(result, callback, handler)
    // Watchdog: if only ambient broadcasts arrive (no real SessionInfo) within
    // the window, the request was likely lost — resend, or recycle the link.
    this._clearSessionInfoTimer()
    this._sessionInfoTimer = setTimeout(() => this._onSessionInfoTimeout(callback), timeout)
    teslaBLE.send(message, handler)
  }
  _onSessionInfoTimeout(callback) {
    this._sessionInfoTimer = null

    // Tier 0: cheap resend on the still-open link. A dropped request chunk just
    // needs another complete copy — no teardown, no scan/reconnect cost (~hundreds
    // of ms vs several seconds). Only safe once the link is quiet of in-flight
    // replies, which the timeout window guarantees.
    if (teslaBLE.isConnected() && this._sessionInfoResends < SESSION_INFO_RESENDS_PER_CONNECT) {
      this._sessionInfoResends++
      console.log(`[SESSION] ⟳ No SessionInfo — resending on same link (resend ${this._sessionInfoResends}/${SESSION_INFO_RESENDS_PER_CONNECT})`)
      this._doSessionInfoRequest(callback)
      return
    }

    // Tier 1: recycle the link, mirroring an app relaunch as closely as we can:
    //   1. disconnect() → _cleanup() runs ble.quit() (native disconnect) + nulls
    //      this.ble. (Not reset() — keeps the BLE page's onDisconnect handler.)
    //   2. flushNative() drops stale native callbacks / queued RX so the next
    //      connection doesn't inherit orphan notification fragments.
    //   3. A short idle settle lets the native stack drain before reconnecting;
    //      a back-to-back reconnect reuses dirty state and re-lands ambient-only.
    if (this._sessionInfoConnects < SESSION_INFO_MAX_CONNECTS) {
      console.log('[SESSION] ⟳ Resends exhausted — recycling BLE link and reconnecting')
      try { teslaBLE.disconnect() } catch (_e) {}
      try { teslaBLE.flushNative() } catch (_e) {}
      setTimeout(() => this._ensureConnected(callback), this.recycleSettleMs)
      return
    }

    console.log('[SESSION] ❌ No SessionInfo after resends + reconnects — giving up')
    try { teslaBLE.disconnect() } catch (_e) {}
    callback({ success: false, error: 'Vehicle not responding to session request. Wake the car and retry.' })
  }
  _handleSessionInfoResponse(result, callback, handler) {
    if (!result.success) {
      this._clearSessionInfoTimer()
      callback({ success: false, error: result.error })
      return
    }
    try {
      if (!result.data) {
        this._clearSessionInfoTimer()
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
        this._clearSessionInfoTimer()
        console.log('[SESSION] ❌ Vehicle rejected key: KEY_NOT_ON_WHITELIST — re-pair required')
        try { teslaBLE.disconnect() } catch (_e) {}
        callback({ success: false, error: 'Key not on vehicle whitelist — re-pair from phone' })
        return
      }

      // Intermediate ack / ambient broadcast: no sessionInfo, payload, or status.
      // Re-register for the real response and keep the watchdog running — if only
      // these arrive until it fires, _onSessionInfoTimeout recycles the link.
      if (!response.sessionInfo && !response.payload && !response.signedMessageStatus) {
        console.log(`[SESSION] Intermediate ack (fields:[${fieldKeys}]), waiting for SessionInfo...`)
        teslaBLE.responseCallback = handler
        return
      }

      this._clearSessionInfoTimer()
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
      this._clearSessionInfoTimer()
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
    // Wall-clock instant we captured the vehicle's clock. expiresAt must track the
    // vehicle's clock as it advances in real time — see _buildAuthMessage.
    this._clockCapturedAtMs = Date.now()

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

    // Fast path: the session key is a constant for a paired watch+vehicle
    // (static watchPrivateKey × static vehicle EC pubkey). If we already derived
    // it for THIS vehicle pubkey, reuse the cached 16-byte key and skip the
    // ~3.8s ECDH (and the table entirely). Guard on the stored EC pubkey
    // matching the live SessionInfo pubkey so a rotated vehicle key falls
    // through to re-derivation. The HMAC tag verify below still runs, so a
    // corrupted cache surfaces as an auth error (→ re-pair), never a silent pass.
    const cachedKey = store.sessionKey
    const storedPub = store.vehicleEcPublicKey
    if (cachedKey && cachedKey.length === 16 && this._ecPubMatches(storedPub, this.vehiclePublicKey)) {
      console.log('[SESSION] Using cached session key — skipping ECDH')
      this.sessionKey = cachedKey
      this._finalizeSession(response, callback, false)
      return
    }

    // Slow path: no usable cache (first connect after pairing, or vehicle key
    // changed). The session key is a constant (watchPriv × vehiclePub), so the
    // PHONE computes the ECDH and returns the 32-byte shared secret — the 16 KB
    // doublings table never has to cross BLE or live on the watch. We derive +
    // cache the key once; every later connect takes the fast path above. Needs
    // the phone; if unreachable here the user re-pairs (the only "case 3" path).
    this._deriveAndCacheSessionKey(response, callback)
  }
  _deriveAndCacheSessionKey(response, callback) {
    const sessionPub = this.vehiclePublicKey
    console.log('[SESSION] No cached key — requesting ECDH shared secret from phone')
    const phone = new Phone()
    phone.computeSharedSecret(sessionPub)
      .then((secret) => {
        if (!secret || secret.length !== 32) {
          callback({ success: false, error: 'Bad shared secret from phone: ' + (secret ? secret.length : 'null') })
          return
        }
        this.sessionKey = sha1(secret).slice(0, 16)
        // Persist only AFTER the SessionInfo HMAC verifies (inside _finalizeSession),
        // so a wrong key (corrupted keypair / bad pubkey) is never cached.
        this._finalizeSession(response, callback, true)
      })
      .catch((e) => {
        console.log('[SESSION] ❌ computeSharedSecret failed: ' + (e && e.message))
        callback({ success: false, error: 'Could not derive session key — re-pair from phone' })
      })
  }
  _ecPubMatches(a, b) {
    if (!a || !b || a.length !== 65 || b.length !== 65) return false
    for (let i = 0; i < 65; i++) if (a[i] !== b[i]) return false
    return true
  }
  _finalizeSession(response, callback, persist) {
    if (!this._verifySessionInfoTag(response, callback)) return
    if (persist) {
      // Cache the verified key + the pubkey it was derived from so every later
      // connect takes the fast path (no phone, no ECDH).
      store.vehicleEcPublicKey = this.vehiclePublicKey
      store.sessionKey = this.sessionKey
      console.log('[SESSION] Session key derived (phone ECDH), verified, and cached')
    }
    const { cmdHmac } = createSessionHmacs(this.sessionKey)
    this._cmdHmacFn = cmdHmac
    this.established = true
    console.log(`[SESSION] ✓ Established: counter=${this.counter}`)
    callback({ success: true, counter: this.counter, epoch: this.epoch ? this.epoch.length : 0 })
  }
  _verifySessionInfoTag(response, callback) {
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
    // The vehicle validates expiresAt against ITS clock, which keeps ticking after we
    // captured clockTime at connect. Using a static `clockTime + 60` means that ~60s
    // into a connection every message is already in the vehicle's past → it rejects
    // with MESSAGEFAULT_ERROR_TIME_EXPIRED (17), killing commands AND passive-entry
    // auth replies (→ alertHandlePulledWithoutAuth). Advance the estimate by the real
    // time elapsed since capture so the 60s window stays ahead of the vehicle's clock.
    const elapsedSec = Math.floor((Date.now() - (this._clockCapturedAtMs || Date.now())) / 1000)
    const expiresAt = this.clockTime + elapsedSec + 60
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
      // Fire the terminal result exactly once and tear down all command state:
      // both timers, the waiting flag, and the BLE callback (so a late frame
      // after a timeout can't double-deliver). Non-terminal requeues do NOT go
      // through here — they call callback(result) directly and keep listening.
      let settled = false
      this._commandInFlight = true // gate the passive-entry responder off the shared slot
      const finish = (result) => {
        if (settled) return
        settled = true
        this._commandInFlight = false
        this._clearCommandTimer()
        if (this._secondResponseTimer) {
          clearTimeout(this._secondResponseTimer)
          this._secondResponseTimer = null
        }
        this._waitingForSecondResponse = false
        teslaBLE.responseCallback = null
        callback(result)
      }
      try {
        const message = this.buildAuthenticatedCommand(rkeActionOrClosure)

        // Track if we received the first response (status push)
        this._waitingForSecondResponse = false

        // Overall deadline: covers "no response at all" and "only unsolicited
        // pushes" — neither arms _secondResponseTimer (that only starts after a
        // first addressed non-terminal reply). Without this a dropped command
        // write hangs the callback forever and wedges the caller's busy flag.
        this._clearCommandTimer()
        this._commandTimer = setTimeout(() => {
          this._commandTimer = null
          console.log('[SESSION] Command timeout — no response from vehicle')
          finish({ success: false, error: 'Command timed out — no response from vehicle' })
        }, this.commandTimeoutMs)

        // Use BLE layer's wrapper to handle multi-response
        teslaBLE.send(message, (result) => {
          if (!result.success) {
            finish({ success: false, error: result.error })
            return
          }
          try {
            const response = parseRoutableMessage(result.data)

            // Tesla streams unsolicited pushes (periodic VehicleStatus etc.) on the
            // same characteristic. They're addressed to a domain, not our routing
            // address, so they'd otherwise be consumed as the command's response and
            // steal a response slot. Drop them and keep listening (the command
            // deadline above still bounds an endless stream of them).
            const ra = this.routingAddress
            const dst = response.toRoutingAddress
            const addressedToUs = ra && dst && dst.length === ra.length && (() => {
              for (let i = 0; i < ra.length; i++) if (ra[i] !== dst[i]) return false
              return true
            })()
            if (!addressedToUs) {
              console.log('[SESSION] Ignoring unsolicited push (not addressed to this command)')
              dumpRxFrame('CMD-UNSOL', result.data, response)
              result._requeue = true
              callback(result)
              return
            }

            // Vehicle sends up to two responses per authenticated command:
            //   1. SessionInfo-only push (field 15, no field 10) — non-terminal,
            //      updates counter/epoch/clock; keep waiting.
            //   2. FromVCSECMessage (field 10) or auth-fault (field 12) — TERMINAL.
            // The terminal FromVCSECMessage is success when it carries no commandStatus
            // — mirrors Tesla SDK executeRKEAction (done := commandStatus == nil). The
            // car acks an RKE action with an EMPTY FromVCSECMessage (field 10, len 0),
            // so detect terminal by the PRESENCE of the payload, not commandStatus.
            const isTerminal = !!(response.payload || response.signedMessageStatus)
            if (!isTerminal && !this._waitingForSecondResponse) {
              this._waitingForSecondResponse = true
              console.log('[SESSION] Got SessionInfo status push, waiting for action response...')
              // The car has answered, so hand the deadline off to the tighter
              // second-response timer — the overall command timer is no longer
              // the right bound now that the link is proven alive.
              this._clearCommandTimer()
              if (this._secondResponseTimer) clearTimeout(this._secondResponseTimer)
              this._secondResponseTimer = setTimeout(() => {
                if (this._waitingForSecondResponse) {
                  console.log('[SESSION] Second response timeout — clearing waiting state')
                  this._secondResponseTimer = null
                  finish({ success: false, error: 'Second response timeout' })
                }
              }, 10000)

              // Pass _requeue back through result so BLE wrapper re-registers callback
              result._requeue = true
              callback(result)
              return
            }

            // Auth-layer fault (counter/epoch mismatch, invalid signature, etc.)
            const mFault = response.signedMessageStatus && response.signedMessageStatus.signedMessageFault
            if (mFault) {
              finish({ success: false, error: `Signed message fault ${mFault}`, response })
              return
            }
            // VCSEC-level ERROR (command rejected — obstruction, unauthorized, etc.)
            if (response.commandStatus && response.commandStatus.operationStatus === 2) {
              finish({ success: false, error: 'Command rejected by vehicle', response })
              return
            }
            finish({ success: true, response })
          } catch (e) {
            finish({ success: false, error: e.message })
          }
        })
      } catch (e) {
        finish({ success: false, error: e.message })
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

    // Fire the terminal result exactly once and tear down command state.
    let settled = false
    let statusTimer = null
    this._commandInFlight = true // gate the passive-entry responder off the shared slot
    const finish = (result) => {
      if (settled) return
      settled = true
      this._commandInFlight = false
      if (statusTimer) { clearTimeout(statusTimer); statusTimer = null }
      teslaBLE.responseCallback = null
      callback(result)
    }
    // Overall deadline: covers "no response" and "only unsolicited pushes"
    // (neither finishes below), so a dropped request can't hang the caller.
    statusTimer = setTimeout(() => {
      statusTimer = null
      console.log('[SESSION] getVehicleStatus timeout — no addressed response')
      finish({ success: false, error: 'Vehicle status timed out' })
    }, this.commandTimeoutMs)

    teslaBLE.send(message, (result) => {
      if (!result.success) {
        finish({ success: false, error: result.error })
        return
      }
      try {
        if (!result.data) {
          finish({ success: false, error: 'No data in vehicle status response' })
          return
        }
        const response = parseRoutableMessage(result.data)

        // Tesla streams unsolicited pushes (periodic VehicleStatus/VCSEC frames)
        // on the same characteristic. They're addressed to a domain, not our
        // routing address, so without this filter the first one is consumed as
        // our reply — and parseVehicleStatus(null) then throws. Drop them and
        // keep listening (the deadline above still bounds an endless stream).
        const ra = this.routingAddress
        const dst = response.toRoutingAddress
        const addressedToUs = ra && dst && dst.length === ra.length && (() => {
          for (let i = 0; i < ra.length; i++) if (ra[i] !== dst[i]) return false
          return true
        })()
        if (!addressedToUs) {
          // The car answers GET_STATUS by PUSHING VehicleStatus unsolicited (addressed
          // to a domain, not our routing address) rather than as an addressed reply, and
          // meanwhile floods auth beacons. Accept any frame that actually carries a status
          // snapshot so the initial load resolves instead of timing out on the flood;
          // only genuinely status-less pushes (auth beacons etc.) are ignored.
          if (response.vehicleStatus) {
            finish({ success: true, status: parseVehicleStatus(response.vehicleStatus) })
            return
          }
          console.log('[SESSION] Ignoring unsolicited push (not a status reply)')
          dumpRxFrame('STATUS-UNSOL', result.data, response)
          result._requeue = true
          callback(result)
          return
        }

        // Addressed to us, but a SessionInfo-only push (counter/epoch refresh)
        // carries no VCSEC payload — non-terminal, keep waiting for the status.
        if (!response.vehicleStatus) {
          console.log('[SESSION] Addressed reply without vehicleStatus, waiting...')
          result._requeue = true
          callback(result)
          return
        }

        const vehicleStatus = parseVehicleStatus(response.vehicleStatus)
        finish({ success: true, status: vehicleStatus })
      } catch (e) {
        console.log(`[SESSION] getVehicleStatus error: ${e.message}`)
        finish({ success: false, error: e.message })
      }
    })
  }
  lock(callback) {
    this.sendCommand(RKE_ACTION_LOCK, callback)
  }
  unlock(callback) {
    this.sendCommand(RKE_ACTION_UNLOCK, callback)
  }
  trunk(callback) {
    this.sendCommand({ closureMoveRequest: buildClosureMoveRequest(CLOSURE_REAR_TRUNK, CLOSURE_MOVE_OPEN) }, callback)
  }
  frunk(callback) {
    this.sendCommand({ closureMoveRequest: buildClosureMoveRequest(CLOSURE_FRUNK, CLOSURE_MOVE_OPEN) }, callback)
  }
  remoteDrive(callback) {
    // Tesla SDK RemoteDrive / "drive" ("Remote start vehicle"): authorizes keyless
    // drive over the authenticated BLE session — the workaround for "configure phone
    // key" when no phone key is passively present. Same RKEAction path as lock/unlock.
    this.sendCommand(RKE_ACTION_REMOTE_DRIVE, callback)
  }
  // Live state: arm a persistent listener on the BLE layer for unsolicited
  // VehicleStatus pushes the car streams while we stay connected (door opened,
  // locked from the app/key, etc.). Each carries a full state snapshot; we hand
  // it to onStatus so the UI can re-render when it differs from what's shown.
  // Idle frames only reach this when no command/session request owns the link,
  // so it never races an in-flight command's response.
  startStatusPushListener(onStatus) {
    this._statusPushHandler = onStatus
    teslaBLE.idleCallback = (result) => {
      if (!result || !result.success || !result.data) return
      try {
        const response = parseRoutableMessage(result.data)
        // DIAGNOSTIC: dump every idle frame in full so a handle-pull / proximity
        // frame the car pushes is visible, not just periodic VehicleStatus.
        dumpRxFrame('IDLE', result.data, response)
        // Passive-entry handshake: the car streams VCSEC requests (AuthenticationRequest,
        // AppDeviceInfoRequest) the key must answer. Respond and stop — a status snapshot
        // and a request never share a frame.
        if (this._respondToVcsecRequest(response)) return
        if (response.vehicleStatus && response.vehicleStatus.length > 0) {
          const status = parseVehicleStatus(response.vehicleStatus)
          if (this._statusPushHandler) this._statusPushHandler(status)
        }
      } catch (e) {
        console.log(`[RX-DUMP IDLE] parse error: ${e.message}`)
      }
    }
  }
  // Dispatch a parsed RoutableMessage to the right passive-entry responder. Returns
  // true if it sent a reply. Shared by the idle listener and the reply-chain (the car
  // answers each response with the NEXT request, so every reply is re-dispatched).
  _respondToVcsecRequest(response) {
    if (!this.established) return false
    // Never fire while a user command (connect/getVehicleStatus/lock/...) owns the BLE
    // response slot — a signed reply here would seize that slot and steal the frame the
    // command is waiting for, starving it into a timeout. Skip WITHOUT marking the token
    // answered, so we still respond on the next beacon once the command finishes.
    if (this._commandInFlight) return false
    if (response.authenticationRequest) return this._handleAuthenticationRequest(response.authenticationRequest)
    if (response.appDeviceInfoRequest) return this._handleAppDeviceInfoRequest(response.appDeviceInfoRequest)
    return false
  }
  // Sign a bare UnsignedMessage on the session and send it, dumping the car's reply
  // (under `tag`-REPLY) and re-dispatching it through the handshake. One-shot: the
  // idle listener resumes after (no _requeue).
  _signSendVcsec(unsigned, tag) {
    const message = this._buildAuthMessage(unsigned)
    teslaBLE.send(message, (result) => {
      if (!result || !result.success) {
        console.log(`[SESSION] ${tag} send failed: ${result && result.error}`)
        return
      }
      try {
        const resp = parseRoutableMessage(result.data)
        dumpRxFrame(`${tag}-REPLY`, result.data, resp)
        // The car often answers a VCSEC reply with a fresh VehicleStatus — surface it so
        // the UI tracks state even when the handshake (not getVehicleStatus) carries it.
        if (resp.vehicleStatus && resp.vehicleStatus.length > 0 && this._statusPushHandler) {
          try { this._statusPushHandler(parseVehicleStatus(resp.vehicleStatus)) } catch (_e) {}
        }
        this._respondToVcsecRequest(resp)
      } catch (e) {
        console.log(`[SESSION] ${tag} reply parse error: ${e.message}`)
      }
    })
  }
  // Passive-entry presence. The vehicle streams AuthenticationRequest beacons ~1Hz,
  // reasonsForAuth=[1 IDENTIFICATION] (or [8] on approach), rotating a 20-byte token
  // ~every 5s. Answering registers the watch as a PRESENT, authenticated key — device-
  // observed: without a reply a handle pull yields Alert.alertHandlePulledWithoutAuth.
  // Dedupe by token (not time) so we sign once per token, not per ~1Hz repeat. The
  // token is not echoed back (AuthenticationResponse has no token field).
  _handleAuthenticationRequest(req) {
    const tokenHex = req.token ? hexDump(req.token) : ''
    if (tokenHex && tokenHex === this._lastAuthToken) return false // already answered
    this._lastAuthToken = tokenHex
    console.log(`[SESSION] AuthenticationRequest reasons=[${req.reasonsForAuth}] level=${req.requestedLevel} token=${tokenHex} — responding`)
    try {
      const unsigned = buildUnsignedMessage({
        authenticationResponse: buildAuthenticationResponse({
          authenticationLevel: req.requestedLevel || AUTH_LEVEL_UNLOCK, // echo requested level
          estimatedDistance: 0, // watch is the key — claim closest; ZeppOS gives no RSSI
          rejection: 0,         // AUTHENTICATIONREJECTION_NONE — we authorize
        }),
      })
      this._signSendVcsec(unsigned, 'AUTH')
      return true
    } catch (e) {
      console.log(`[SESSION] AuthenticationRequest handling error: ${e.message}`)
      return false
    }
  }
  // The car follows an accepted AuthenticationResponse with AppDeviceInfoRequest
  // (field 44 = GET_MODEL_NUMBER), asking the key to describe itself. Reply with a
  // minimal AppDeviceInfo (model hash + OS + no UWB). Debounced — the car re-asks while
  // it waits, but one signed reply per second is plenty.
  _handleAppDeviceInfoRequest(_request) {
    const now = Date.now()
    if (this._lastDeviceInfoTime && now - this._lastDeviceInfoTime < 1000) return false
    this._lastDeviceInfoTime = now
    console.log('[SESSION] AppDeviceInfoRequest — responding with AppDeviceInfo')
    try {
      const modelHash = sha256(new Uint8Array([0x61, 0x6d, 0x61, 0x7a, 0x6c, 0x61])) // sha256("amazla")
      const unsigned = buildUnsignedMessage({
        appDeviceInfo: buildAppDeviceInfo({
          hardwareModelSha256: modelHash,
          os: APP_OS_ANDROID,   // enrolled via the Android companion app
          uwb: UWB_UNSUPPORTED, // watch has no UWB radio
        }),
      })
      this._signSendVcsec(unsigned, 'DEVINFO')
      return true
    } catch (e) {
      console.log(`[SESSION] AppDeviceInfoRequest handling error: ${e.message}`)
      return false
    }
  }
  stopStatusPushListener() {
    this._statusPushHandler = null
    try { teslaBLE.idleCallback = null } catch (_e) {}
  }
  ensureSessionEstablished(callback) {
    // If session already established, call callback immediately
    if (this.established) {
      callback({ success: true })
      return
    }
    // Gate on enrollment (keypair + VIN), NOT isPaired: the session key is
    // derived BY the connect this allows, so requiring it would deadlock the
    // first-connect bootstrap.
    if (!store.isEnrolled) {
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
