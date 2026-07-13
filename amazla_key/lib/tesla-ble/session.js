import Phone from '../phone.js'
import store from '../store.js'
import teslaBLE, { CONNECTION_CONFIG } from './ble.js'
import { computeTeslaBLEName } from './ble-name.js'
import { createSessionHmacs, createSessionInfoHmac } from './crypto/hmac.js'
import { sha1, sha256 } from './crypto/sha256.js'
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
  RKE_ACTION_WAKE_VEHICLE,
} from './protocol/vcsec.js'


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
// Cold-connect retry loop (mirrors the Tesla Go SDK's connect loop). The car
// reliably drops the FIRST GATT connection of a session — instantly or after a
// hang the ble.js setup watchdog now caps — then accepts the next. So we re-dial
// the just-scanned MAC directly (no re-scan: within a connect burst the address
// can't have rotated) up to MAX_CONNECT_ATTEMPTS, with only a brief settle so the
// native stack drains between dials. Device data + Go SDK + ESPHome all agree the
// first cold connect can't be made to stick; bounded-attempt + fast retry is the fix.
const MAX_CONNECT_ATTEMPTS = 4
const CONNECT_RETRY_SETTLE_MS = 150
// Beat between stopScan() and the first dial — guards an observed race where mstConnect
// silently hangs when issued back-to-back with scan teardown. Trimmed 200→100ms to shave
// connect latency; raise back to 200 if dials start hanging (the 8s connect watchdog +
// re-dial loop would catch a hang, but at a latency cost).
const SCAN_TEARDOWN_SETTLE_MS = 100
// Idle gap between tearing down the link and reconnecting on a Tier-1 recycle.
// Lets the native BLE stack drain queued RX (stale notification fragments) while
// nothing is attached — a back-to-back reconnect reuses that dirty state.
const RECYCLE_SETTLE_MS = 600
// Overall deadline for an authenticated command, covering the cases the
// per-second-response timer (_secondResponseTimer) does NOT: the vehicle never
// replies at all, or only streams unsolicited pushes. A dropped command write
// (unacked WRITE_WITHOUT_RESPONSE) would otherwise leave the callback pending
// forever — wedging the caller's busy flag with no error and no recovery.
// 6s (was 15s): device 2026-07-13 — every answered command (ack, refusal, closure)
// lands in ≤1s; a car that stays silent past a few seconds isn't going to answer
// this frame at all (post-refusal swallow / escalation window), so the long wait
// only froze the UI. Lock/unlock ride even shorter deadlines + a retry (see the
// facade); STATUS_TIMEOUT_MS below stays long for the push-paced status wait.
const COMMAND_TIMEOUT_MS = 6000
// getVehicleStatus deadline: a manual refresh may legitimately wait on a CAR-PACED
// VehicleStatus push (8–31s observed when passive entry is active), so it must not
// share the command deadline.
const STATUS_TIMEOUT_MS = 15000

// Passive entry ON — we answer the car's AuthenticationRequest beacons. A signed session
// (SessionInfo) is necessary but NOT sufficient: the car also wants the per-connection
// presence handshake (AuthenticationRequest → AuthenticationResponse) before it actuates,
// asleep or not — that's what the phone does, which is why the phone unlocks a sleeping car
// and our "session established but never answered beacons" key did not. The command must
// KEEP answering beacons while in flight (gate=false in sendCommand), like the phone.
const PASSIVE_ENTRY_ENABLED = true

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
    this.statusTimeoutMs = STATUS_TIMEOUT_MS
    this.secondResponseTimeoutMs = 10000
    this._passiveEventCb = null // UI hook for passive-entry events (set by the Tesla facade)
    this._linkDownCb = null // facade hook: unexpected native link loss (set once, survives reset())
  }
  // Register the facade's link-loss observer. Fired AFTER the session has reset
  // itself, so the facade can flip the UI offline without re-entering session state.
  onLinkDown(cb) {
    this._linkDownCb = cb
  }
  // Unexpected native link loss (teslaBLE.onLinkDown — a late native callback
  // reported the link dead). Device 2026-07-13: a car-side drop surfaced only 40s
  // after dial; session/facade/widget all stayed "online" on a dead link and every
  // tap built a signed command into it, failing silently. The session dies with the
  // link (counters/HMAC are per-connection) — reset and notify the facade.
  _handleLinkDown() {
    if (!this.established) return // mid-connect drops are handled by the connect path
    console.log('[SESSION] Link down — native disconnect on an established session, resetting')
    this.reset()
    if (this._linkDownCb) {
      try { this._linkDownCb() } catch (_e) {}
    }
  }
  // Register a single observer for passive-entry handshake milestones (initiated /
  // approaching / authorized). Surfaced to the UI as toasts; pure observation, never
  // affects the handshake. Latched once-per-connection in reset() so the ~1Hz beacon
  // repeats don't spam the same toast.
  onPassiveEvent(cb) {
    this._passiveEventCb = cb
  }
  _emitPassive(type) {
    if (!this._passiveEventCb) return
    try {
      this._passiveEventCb({ type: type })
    } catch (_e) {}
  }
  // Read-first toggle: while on, the passive-entry responder stays silent (see
  // _respondToVcsecRequest) so a connect-time GET_STATUS gets a clean, SDK-style reply.
  suppressPassive(on) {
    this._suppressPassive = !!on
  }
  reset() {
    // Invalidate any in-flight connect cycle (see ensureSessionEstablished's
    // generation guard) — its completion must not touch post-reset state.
    this._connectGen = (this._connectGen || 0) + 1
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
    this._suppressPassive = false // read-first window gate (see suppressPassive)
    // Passive-entry toast latches — one toast per milestone per connection.
    this._pePresentEmitted = false
    this._peApproachEmitted = false
    this._peAuthorizedEmitted = false
    this._clearSessionInfoTimer()
    this._clearCommandTimer()
  }

  // Full app-close teardown: clear session state AND flush the native BLE stack.
  // reset() alone intentionally leaves the native link (and its onDisconnect handler)
  // alone; the native flush (teslaBLE.reset → ble.quit / mstDisconnect / stale-state
  // clear) is what stops a poisoned mstConnect on the next launch. Owning teslaBLE
  // here keeps the reset out of the tesla facade, which only talks to this session.
  shutdown() {
    try {
      this.reset()
    } catch (_e) {}
    try {
      teslaBLE.reset()
    } catch (_e) {}
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
  _clearResendTimer() {
    if (this._resendTimer) {
      clearTimeout(this._resendTimer)
      this._resendTimer = null
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
    // Do NOT read vehicleEcPublicKey / sessionKey here. They're file-backed (readBinary,
    // ~50-130ms each cold) and aren't needed until _processSessionInfo after SessionInfo
    // lands — reading them now just to log "present/absent" gated the scan by up to ~260ms
    // on a cold connect. _doConnect prewarms them during the dial/GATT idle instead, and
    // _processSessionInfo logs their actual use ("Using cached session key", "Vehicle public
    // key: N bytes"), so no diagnostic value is lost.
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
        setTimeout(() => this._doConnect(foundMAC, 1, callback), SCAN_TEARDOWN_SETTLE_MS)
      }
      if (r.type === 'complete' && !foundMAC) {
        console.log(`[SESSION] ✗ ${expectedName} not in BLE range`)
        callback({
          success: false,
          error: 'Vehicle not in BLE range. Wake the car (touch a door handle) and retry. If it keeps failing, check the VIN in Settings.',
        })
      }
    }, 3000, expectedName)
  }
  _doConnect(mac, attempt, callback) {
    console.log(`[SESSION] Dialing vehicle: ${mac} (attempt ${attempt}/${MAX_CONNECT_ATTEMPTS})`)
    // Prewarm the file-backed key cache (vehicle_ec_public_key + session_key, ~50-130ms each
    // cold) during the dial + GATT-setup idle window (~1.5s where JS just waits on BLE
    // callbacks). _processSessionInfo needs both after SessionInfo lands; reading them now —
    // in the BLE wait shadow — keeps the I/O off the critical path (neither before the scan
    // nor after SessionInfo). One-shot on the first dial; later reads hit the warm cache.
    if (attempt === 1) {
      setTimeout(() => {
        try { const a = store.vehicleEcPublicKey, b = store.sessionKey; return a || b } catch (_e) {}
      }, 0)
    }
    // First dial gets the full timeout; re-dials get the shorter retryTimeoutMs (the car's
    // already proven reachable, so a hung re-dial should fail fast for the next attempt).
    const dialTimeoutMs = attempt === 1 ? CONNECTION_CONFIG.timeoutMs : CONNECTION_CONFIG.retryTimeoutMs
    teslaBLE.connect(mac, (result) => {
      console.log('[SESSION] Connect callback fired, result:', JSON.stringify(result))
      if (!result.success) {
        // Expected on a cold car: it drops the first GATT connection of a session.
        // ble.connect() has already run _cleanup() (fresh BLEMaster next dial), so
        // just re-dial the same MAC after a brief settle. No re-scan — the address
        // was freshly scanned at the start of this burst and can't have rotated yet.
        if (attempt < MAX_CONNECT_ATTEMPTS) {
          console.log(`[SESSION] ⟳ Connect failed (${result.error || 'unknown'}) — re-dialing (${attempt + 1}/${MAX_CONNECT_ATTEMPTS})`)
          setTimeout(() => this._doConnect(mac, attempt + 1, callback), CONNECT_RETRY_SETTLE_MS)
          return
        }
        console.log(`[SESSION] ✗ Connection failed after ${attempt} attempts: ${result.error || 'unknown'}`)
        callback({ success: false, error: `BLE connection failed: ${result.error || 'unknown'}` })
        return
      }
      console.log(`[SESSION] ✓ Connected to vehicle (attempt ${attempt}), proceeding`)
      // Arm the unexpected-link-loss hook for THIS link (re-armed every connect;
      // teslaBLE.reset() on shutdown clears it). Deliberate teardowns don't fire it.
      teslaBLE.onLinkDown = () => this._handleLinkDown()
      this._proceedWithSession(callback)
    }, dialTimeoutMs)
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
    const watchPub = store.watchPublicKey
    if (!watchPub || watchPub.length !== 65) {
      callback({ success: false, error: 'Watch public key missing — re-pair from phone' })
      return
    }
    // Only the enrolled PUBLIC key is needed: it's the SessionInfoRequest identity,
    // and the ECDH runs on the phone (no BigInt in QuickJS). The watch holds no
    // private key — the enrolled secret never leaves the companion.
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
    if (expectedTag.length !== response.sessionInfoTag.length) {
      console.log(`[SESSION] ❌ SessionInfo HMAC length mismatch — exp=${expectedTag.length} got=${response.sessionInfoTag.length}`)
      callback({ success: false, error: 'Invalid SessionInfo HMAC' })
      return false
    }
    let diff = 0
    for (let i = 0; i < expectedTag.length; i++) diff |= expectedTag[i] ^ response.sessionInfoTag[i]
    if (diff !== 0) {
      // Hex-free diagnostic: the structural failures (e.g. the field-51 uuid bug, which
      // hit challengeLen=0) show up in the INPUT LENGTHS; tagsDifferAtByte distinguishes
      // "completely wrong key/inputs" (0) from a near-miss. Full-byte hex dump removed —
      // re-add a temp one from git only if lengths all look right but bytes still diverge.
      let firstDiff = 0
      while (firstDiff < expectedTag.length && expectedTag[firstDiff] === response.sessionInfoTag[firstDiff]) firstDiff++
      console.log(`[SESSION] ❌ SessionInfo HMAC mismatch — vinLen=${vin.length} challengeLen=${challenge.length} infoLen=${infoBytes ? infoBytes.length : 0} tagLen=${expectedTag.length} tagsDifferAtByte=${firstDiff}`)
      callback({ success: false, error: 'Invalid SessionInfo HMAC' })
      return false
    }
    console.log('[SESSION] ✓ SessionInfo tag verified')
    return true
  }
  // Shared auth message builder: counter++, HMAC tag, SignatureData, RoutableMessage.
  // Takes a pre-built UnsignedMessage; returns the RoutableMessage bytes ready to send.
  _buildAuthMessage(unsignedMessage, routingAddressOverride) {
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
    // Stash the uuid we put in field 51 so the command path can correlate the
    // vehicle's reply: the car echoes it back as request_uuid (field 50). A clean
    // RKE ack is an EMPTY FromVCSECMessage — identical in shape to the ack the car
    // sends for the pre-command WAKE prod and for passive-entry handshake frames —
    // so the ONLY way to tell "this is MY command's ack" from "this is the wake's
    // ack" is the echoed uuid. Without it the command finishes on the wake's ack
    // (instant false success, no actuation) or a status-poll frame (timeout).
    const uuid = generateUUID()
    this._lastBuiltUuid = uuid
    // routingAddressOverride lets a single request own a UNIQUE return address (SDK
    // dispatcher style) so its reply self-routes to that request's waiter instead of
    // the shared slot. Falls back to the stable session address for the passive-entry
    // responder and the wake prod, whose replies we don't correlate.
    return buildRoutableMessage({
      toDomain: DOMAIN_VEHICLE_SECURITY,
      routingAddress: routingAddressOverride || this.routingAddress,
      payload: unsignedMessage,
      signatureData,
      uuid,
    })
  }
  buildAuthenticatedCommand(rkeActionOrClosure, routingAddressOverride) {
    if (!this.established) {
      throw new Error('Session not established')
    }
    // For HMAC commands the payload is a bare vcsec.UnsignedMessage; auth rides in
    // RoutableMessage.signature_data. No SignedMessage/ToVCSECMessage wrapper.
    const unsignedMessage =
      typeof rkeActionOrClosure === 'number'
        ? buildUnsignedMessage({ rkeAction: rkeActionOrClosure })
        : buildUnsignedMessage(rkeActionOrClosure) // { closureMoveRequest: <Uint8Array> }
    return this._buildAuthMessage(unsignedMessage, routingAddressOverride)
  }
  sendCommand(rkeActionOrClosure, callback, timeoutMs, opts) {
    // gate=false keeps the passive-entry / AppDeviceInfo responder ANSWERING while this
    // command is in flight. On a dozing car the vehicle only actuates once it has escalated
    // (it asks for AppDeviceInfo ~6s in), and gating that off deadlocks — device 2026-07-13:
    // gated locks timed out 15s while gate:false unlocks acked in ~0.7s on the same
    // connection. Lock/unlock pass gate:false; the ack is safe either way (address-routed
    // waiter). Closures/drive still default to gated until device-tested.
    const gate = !(opts && opts.gate === false)
    const doSend = () => {
      // Fire the terminal result exactly once and tear down all command state:
      // both timers, the waiting flag, and the address-routed waiter (so a late
      // frame after a timeout can't double-deliver). Non-terminal frames return
      // early and leave the waiter armed.
      let settled = false
      let waiterToken = null // this command's address-routed BLE waiter — remove only our own
      // Per-request routing address (SDK dispatcher style): the command + its resends all
      // carry this as from_destination, the car echoes it as to_destination, and our waiter
      // matches on it. So the command's reply self-routes to THIS request and can't be eaten
      // by a concurrent status poll / passive-entry frame on the shared response slot.
      const cmdAddr = generateRoutingAddress()
      const _cmdAddressed = (payload) => {
        try {
          const dst = parseRoutableMessage(payload).toRoutingAddress
          if (!dst || dst.length !== cmdAddr.length) return false
          for (let i = 0; i < cmdAddr.length; i++) if (dst[i] !== cmdAddr[i]) return false
          return true
        } catch (_e) {
          return false
        }
      }
      if (gate) this._commandInFlight = true // gate the passive-entry responder off the shared slot
      const finish = (result) => {
        if (settled) return
        settled = true
        if (gate) this._commandInFlight = false
        this._clearCommandTimer()
        this._clearResendTimer()
        if (this._secondResponseTimer) {
          clearTimeout(this._secondResponseTimer)
          this._secondResponseTimer = null
        }
        this._waitingForSecondResponse = false
        teslaBLE.removeWaiter(waiterToken)
        callback(result)
      }
      // The uuids of every frame WE sent for THIS command (initial + each resend).
      // The car's terminal ack echoes one of them as request_uuid; only a reply whose
      // request_uuid is in here is genuinely our actuation ack (not the wake's ack or
      // a passive-entry frame, which carry different uuids).
      const myUuids = []
      const _uuidMatches = (u) => {
        if (!u) return false
        for (let i = 0; i < myUuids.length; i++) {
          const m = myUuids[i]
          if (m && m.length === u.length) {
            let eq = true
            for (let j = 0; j < u.length; j++) if (m[j] !== u[j]) { eq = false; break }
            if (eq) return true
          }
        }
        return false
      }
      try {
        // Prod the radio awake FIRST. The phone unlocks a DOZING car instantly: VCSEC
        // actuates RKE while dozing (only GET_STATUS needs a full wake), but a cold
        // radio can drop the first frame, so fire a wake (fire-and-forget — a deep
        // asleep car never ACKs it, the effect is on TX) ahead of the command.
        //
        // ORDER IS LOAD-BEARING: the anti-replay counter is assigned at BUILD time, and
        // the vehicle rejects any message whose counter isn't strictly above the last it
        // accepted (MESSAGEFAULT_ERROR_INVALID_TOKEN_OR_COUNTER = 6). If the wake were
        // built AFTER the command it would carry the HIGHER counter; whenever its frame
        // won the TX race the car would accept the wake then reject the command's lower
        // counter as a replay — exactly the fault-6 we saw on whichever command lost the
        // race. Build+send the wake first so the command always holds the higher counter.
        try {
          teslaBLE.sendNoReply(this._buildAuthMessage(buildUnsignedMessage({ rkeAction: RKE_ACTION_WAKE_VEHICLE })))
        } catch (_e) {}

        const message = this.buildAuthenticatedCommand(rkeActionOrClosure, cmdAddr)
        myUuids.push(this._lastBuiltUuid) // record THIS command's uuid (built after the wake → higher counter)

        console.log(
          `[SESSION] TX command: ${typeof rkeActionOrClosure === 'number' ? `RKE=${rkeActionOrClosure}` : 'closureMoveRequest'}`,
        )

        // Track if we received the first response (status push)
        this._waitingForSecondResponse = false

        // Overall deadline: covers "no response at all" and "only unsolicited
        // pushes" — neither arms _secondResponseTimer (that only starts after a
        // first addressed non-terminal reply). Without this a dropped command
        // write hangs the callback forever and wedges the caller's busy flag.
        //
        // retriesOnTimeout (opts, lock/unlock ONLY — they're idempotent): on a
        // FULL-deadline expiry with no reply at all, re-run the whole command as a
        // fresh build (new counter/uuid/address, wake prod included). Device
        // 2026-07-13: after a nominalError refusal the car IGNORES a repeat of the
        // same RKE action for ~5–15s (wake still acked, command swallowed) — one
        // deadline-spaced retry rides that window out. This is NOT the old 1.5s
        // blind resend (device 2026-06-26 double-unlock): a retry fires only after
        // the full deadline, when no ack can still be in flight. Never set it for
        // closures/drive — a duplicate there toggles.
        this._clearCommandTimer()
        this._commandTimer = setTimeout(() => {
          this._commandTimer = null
          const retries = (opts && opts.retriesOnTimeout) || 0
          if (retries > 0 && !this._waitingForSecondResponse) {
            console.log(`[SESSION] Command timeout — retrying with fresh counter (${retries} left)`)
            // Tear down THIS attempt without settling the caller, then re-enter.
            settled = true
            if (gate) this._commandInFlight = false
            teslaBLE.removeWaiter(waiterToken)
            this.sendCommand(rkeActionOrClosure, callback, timeoutMs, Object.assign({}, opts, { retriesOnTimeout: retries - 1 }))
            return
          }
          console.log('[SESSION] Command timeout — no response from vehicle')
          finish({ success: false, error: 'Command timed out — no response from vehicle' })
        }, timeoutMs || this.commandTimeoutMs)

        // No resends within an attempt: send ONCE and report success (the car's ack) or
        // failure (deadline). Resending blindly on a timer re-actuated the car when an ack
        // arrived slower than the interval (device 2026-06-26: ~1.6s ack vs 1.5s resend →
        // double unlock); and a miss is usually escalation latency, not a dropped frame
        // (device 2026-06-29: a weak-signal car ignores the command at reason-1 for ~10s,
        // so an early resend lands while it's still not listening).
        this._clearResendTimer()

        // Address-routed waiter: the car's reply to THIS command comes back addressed to
        // cmdAddr (which only this command uses), so the waiter delivers exactly this
        // command's frames — no concurrent status poll / passive-entry frame can be
        // mistaken for the ack, and the ack can't be stolen by them holding the slot.
        waiterToken = teslaBLE.sendAddressed(message, _cmdAddressed, (result) => {
          if (!result.success) {
            finish({ success: false, error: result.error })
            return
          }
          try {
            const response = parseRoutableMessage(result.data)

            // The frame is already matched to this command's address — it IS our reply.
            // The car sends up to two: a SessionInfo-only push (field 15, no field 10),
            // then the terminal ack (field 10, possibly EMPTY) or an auth fault (field 12).
            // Now that address routing guarantees ownership, an empty field-10 here is
            // genuinely OUR ack (the wake prod uses the stable address, so its ack never
            // lands here). uuid match is kept as a redundant positive signal.
            const isTerminal =
              !!response.payload ||
              !!response.signedMessageStatus ||
              !!response.commandStatus ||
              _uuidMatches(response.requestUuid)
            if (!isTerminal) {
              // SessionInfo-only push: the car heard us and the action ack follows. Stop
              // prodding the radio and hand the deadline to the tighter second-response
              // timer. The waiter stays armed for the ack.
              if (response.sessionInfo && !this._waitingForSecondResponse) {
                this._waitingForSecondResponse = true
                console.log('[SESSION] Got SessionInfo status push, waiting for action response...')
                this._clearResendTimer()
                this._clearCommandTimer()
                if (this._secondResponseTimer) clearTimeout(this._secondResponseTimer)
                this._secondResponseTimer = setTimeout(() => {
                  if (this._waitingForSecondResponse) {
                    console.log('[SESSION] Second response timeout — clearing waiting state')
                    this._secondResponseTimer = null
                    finish({ success: false, error: 'Second response timeout' })
                  }
                }, this.secondResponseTimeoutMs)
              }
              return // waiter stays armed
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
            // Nominal error: the car understood and REFUSED (field10 = FromVCSECMessage.
            // nominalError, e.g. lock with a door open → CLOSURES_OPEN). Device 2026-07-13:
            // this used to fall through to "terminal ✓" and report success, so the app
            // flipped to locked while the car sat open.
            if (response.nominalError) {
              console.log(`[SESSION] cmd refused: genericError=${response.nominalError.genericError} (${response.nominalError.name})`)
              finish({ success: false, error: `Vehicle refused — ${response.nominalError.name}`, response })
              return
            }
            console.log('[SESSION] cmd terminal ✓')
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
  // timeoutMs (optional) overrides the default deadline — the initial app-load
  // fetch uses a short one so a dozing car (which never answers) falls through
  // to wake()+refetch quickly instead of burning the full 15s.
  // Manual-refresh only — NOT used on connect. Device 2026-06-26 proved the car NEVER
  // serves an addressed GET_STATUS reply to a passive-entry key (it only streams
  // AuthenticationRequest beacons + an UNSOLICITED, domain-addressed VehicleStatus push
  // once the passive-entry handshake escalates). So this fires one unsigned read (Go SDK
  // AuthMethodNone) and resolves on ANY frame carrying a vehicleStatus — i.e. it just
  // waits for the next push within the deadline. No beacon suppression, no retry: both
  // were futile, and suppression actively DELAYED escalation (the only status channel).
  getVehicleStatus(callback, timeoutMs) {
    if (!this.established) {
      callback({ success: false, error: 'Session not established' })
      return
    }
    const statusAddr = generateRoutingAddress()
    // SIGNED GET_STATUS. The car ignores an UNSIGNED read from a passive-entry key (that's
    // why the Go-SDK-style AuthMethodNone read never answered for us — the SDK isn't a
    // passive-entry key), but it DOES serve our signed/authenticated messages (the unlock
    // gets an addressed ack every time). A signed InformationRequest(GET_STATUS) makes the
    // car reply with VehicleStatus addressed to us — see the _buildAuthMessage note about
    // the old double-wrap accidentally eliciting exactly that. So sign it like a command.
    const message = this._buildAuthMessage(
      buildUnsignedMessage({ informationRequest: buildInformationRequest(INFO_REQUEST_GET_STATUS) }),
      statusAddr,
    )
    let settled = false
    let deadlineTimer = null
    let waiterToken = null
    const finish = (result) => {
      if (settled) return
      settled = true
      if (deadlineTimer) { clearTimeout(deadlineTimer); deadlineTimer = null }
      teslaBLE.removeWaiter(waiterToken)
      callback(result)
    }
    // Match our addressed reply (if the car ever sends one) OR any unsolicited VehicleStatus
    // push (the real channel — addressed to the domain, not our routing address).
    const match = (payload) => {
      try {
        const rm = parseRoutableMessage(payload)
        if (rm.vehicleStatus) return true
        const dst = rm.toRoutingAddress
        if (dst && dst.length === statusAddr.length) {
          for (let i = 0; i < statusAddr.length; i++) if (dst[i] !== statusAddr[i]) return false
          return true
        }
        return false
      } catch (_e) {
        return false
      }
    }
    deadlineTimer = setTimeout(() => {
      deadlineTimer = null
      console.log('[SESSION] getVehicleStatus timeout — no VehicleStatus within deadline')
      finish({ success: false, error: 'Vehicle status timed out' })
    }, timeoutMs || this.statusTimeoutMs)
    waiterToken = teslaBLE.sendAddressed(message, match, (result) => {
      if (!result.success) {
        finish({ success: false, error: result.error })
        return
      }
      try {
        const response = parseRoutableMessage(result.data)
        if (!response.vehicleStatus) return // SessionInfo-only refresh — keep waiting
        console.log(`[SESSION] status RX ${result.data.length}B — applying VehicleStatus`)
        finish({ success: true, status: parseVehicleStatus(response.vehicleStatus) })
      } catch (e) {
        console.log(`[SESSION] getVehicleStatus error: ${e.message}`)
        finish({ success: false, error: e.message })
      }
    })
  }
  lock(callback, opts) {
    this.sendCommand(RKE_ACTION_LOCK, callback, opts && opts.timeoutMs, opts)
  }
  unlock(callback, opts) {
    // 3s deadline (not the 15s default): a normal car acks the unlock in ~1.7s, so a no-ack
    // by 3s means it didn't take — report failure fast (toast) instead of hanging 15s. No
    // resends; a miss is a retry (tap).
    this.sendCommand(RKE_ACTION_UNLOCK, callback, (opts && opts.timeoutMs) || 3000, opts)
  }
  // Fire a signed LOCK and flush it in one JS turn — for app-close auto-lock only.
  // The normal sendCommand path waits for an ACK over chunked (setTimeout) TX, which
  // can't complete in onDestroy before the process dies. Here we sign once and write
  // all chunks synchronously (sendNoReplySync), no ACK wait. Returns true if sent.
  lockSyncFireAndForget() {
    if (!this.established) return false
    try {
      const message = this.buildAuthenticatedCommand(RKE_ACTION_LOCK)
      return teslaBLE.sendNoReplySync(message)
    } catch (e) {
      console.log(`[SESSION] autolock send error: ${e && e.message}`)
      return false
    }
  }
  wake(callback) {
    // A dozing car keeps VCSEC beaconing but ignores GET_STATUS (device 2026-06-11:
    // connect-time fetch silent, post-actuation fetch answered in 0.8s). Same wake
    // the phone app sends on connect. FIRE-AND-FORGET: a deeply-asleep car never
    // ACKs the wake (device 2026-06-12: 15s Command timeout), and the wake EFFECT
    // is on TX. Crucially, we do NOT take the response slot / _commandInFlight gate
    // here — doing so would freeze the passive-entry responder (the core key
    // function) while waiting for an ack that never comes. Just sign, send, return.
    try {
      if (this.established) {
        const unsigned = buildUnsignedMessage({ rkeAction: RKE_ACTION_WAKE_VEHICLE })
        teslaBLE.sendNoReply(this._buildAuthMessage(unsigned))
      }
    } catch (e) {
      console.log(`[SESSION] wake send error: ${e && e.message}`)
    }
    if (callback) callback({ success: true })
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
        // Passive-entry handshake: the car streams VCSEC requests (AuthenticationRequest,
        // AppDeviceInfoRequest) the key must answer. Respond and stop — a status snapshot
        // and a request never share a frame.
        if (this._respondToVcsecRequest(response)) return
        if (response.vehicleStatus && response.vehicleStatus.length > 0) {
          const status = parseVehicleStatus(response.vehicleStatus)
          if (this._statusPushHandler) this._statusPushHandler(status)
        }
        // Anything else here is an idle frame we don't act on (e.g. a wake-prod ack
        // on the stable session address) — drop it silently.
      } catch (e) {
        console.log(`[SESSION] idle frame parse error: ${e.message}`)
      }
    }
  }
  // Dispatch a parsed RoutableMessage to the right passive-entry responder. Returns
  // true if it sent a reply. Shared by the idle listener and the reply-chain (the car
  // answers each response with the NEXT request, so every reply is re-dispatched).
  _respondToVcsecRequest(response) {
    if (!this.established) return false
    // Read-first window: stay SILENT so the car treats us as a plain command key (like the
    // Go SDK, which never does passive entry) and serves our addressed GET_STATUS. The
    // passive-entry push is car-paced 22–40s (device 2026-06-29); a clean read should be
    // ~1s. We don't mark the token answered, so walk-up resumes intact when the window ends.
    if (this._suppressPassive) return false
    // We answer AuthenticationRequest beacons from t=0 — no suppression. Device 2026-06-26
    // proved the car never serves an addressed GET_STATUS to a passive-entry key; fresh
    // VehicleStatus only arrives as an unsolicited push as THIS handshake escalates, so
    // pausing our replies (the old "clean read window") only delayed the status it was
    // meant to fetch. Answer beacons immediately so escalation — the real channel — starts
    // at once; the live-push listener applies whatever VehicleStatus the car volunteers.
    // Never fire while a user command (lock/unlock/drive) owns the BLE
    // response slot — a signed reply here would seize that slot and steal the frame the
    // command is waiting for, starving it into a timeout. Skip WITHOUT marking the token
    // answered, so we still respond on the next beacon once the command finishes.
    // getVehicleStatus deliberately does NOT take this gate: it dispatches beacons here
    // itself, trading its (rarely-answered) slot for keeping the link alive.
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
    // TEMPORARY: passive entry disabled — act as a plain command key (like the Go SDK,
    // which never answers AuthenticationRequest and whose commands actuate cleanly). We
    // do NOT respond to the car's beacons; on connect we just fire unlock. Flip
    // PASSIVE_ENTRY_ENABLED back to true to restore walk-up.
    if (!PASSIVE_ENTRY_ENABLED) return false
    const token = req.token
    const prev = this._lastAuthToken
    if (token && prev && token.length === prev.length) {
      let same = true
      for (let i = 0; i < token.length; i++) { if (token[i] !== prev[i]) { same = false; break } }
      if (same) return false // already answered this token (deduped by bytes, not hex)
    }
    this._lastAuthToken = token
    console.log(`[SESSION] AuthenticationRequest reasons=[${req.reasonsForAuth}] level=${req.requestedLevel} — responding`)
    // Surface the handshake milestone to the UI (once per connection). reason 8 =
    // ENTERED_HIGHER_AUTH_ZONE (the car thinks we're walking up); anything else (reason 1
    // IDENTIFICATION) is the initial presence ping. "authorized" follows when the car
    // accepts and asks for AppDeviceInfo (see _handleAppDeviceInfoRequest).
    var reasons = req.reasonsForAuth || []
    var approaching = false
    for (var ri = 0; ri < reasons.length; ri++) if (reasons[ri] === 8) approaching = true
    if (approaching) {
      if (!this._peApproachEmitted) { this._peApproachEmitted = true; this._emitPassive('approaching') }
    } else if (!this._pePresentEmitted) {
      this._pePresentEmitted = true
      this._emitPassive('initiated')
    }
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
    // The car only asks for AppDeviceInfo AFTER it has accepted our AuthenticationResponse —
    // so this is the "authorized" milestone for the UI (once per connection).
    if (!this._peAuthorizedEmitted) { this._peAuthorizedEmitted = true; this._emitPassive('authorized') }
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
      // NOTE: a post-escalation wake here does NOT pull the VehicleStatus push forward
      // (device 2026-06-26: car ACKed the wake but still pushed status ~10s later). The
      // push cadence is car-controlled; only a real actuation (lock/unlock) triggers the
      // fast ~0.8s push. So we don't bother — status rides the live-push listener.
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
      callback({ success: false, error: 'Not paired - complete setup first' })
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

    // Generation guard: reset() (widget onPause teardown) can run while this
    // connect is in flight, and a NEW connect can start before the old completion
    // fires (secondary-widget pause→resume, device crash 2026-07-13: the orphaned
    // completion consumed/nulled the new cycle's pendingCallbacks → forEach of
    // null right after "✓ Established"). Each cycle takes a generation; reset()
    // bumps it, so a stale completion is dropped instead of settling — or
    // clobbering — a cycle it doesn't own.
    const gen = this._connectGen
    this.requestSessionInfo((result) => {
      if (gen !== this._connectGen) return // torn down or preempted — not our cycle anymore
      this._connecting = false
      const callbacks = this.pendingCallbacks
      this.pendingCallbacks = null
      if (callbacks) callbacks.forEach((cb) => cb(result))
    })
  }
}
const teslaSession = new TeslaSession()
export { TeslaSession }
export default teslaSession
