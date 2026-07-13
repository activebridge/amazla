import { BLEMaster } from '@silver-zepp/easy-ble'
import * as hmBle from '@zos/ble'
import { LocalStorage } from '@zos/storage'

const TESLA_SERVICE_UUID = '00000211-b2d1-43f0-9b88-960cebf8b91e'
const TESLA_WRITE_UUID = '00000212-b2d1-43f0-9b88-960cebf8b91e'
const TESLA_READ_UUID = '00000213-b2d1-43f0-9b88-960cebf8b91e'
const BLE_CHUNK_SIZE = 20
// Delay between successive WRITE_WITHOUT_RESPONSE chunks of one request. These
// writes are unacked, so if we outrun the link they silently drop and the car
// receives a truncated request → it never replies, just keeps broadcasting
// ambient frames (the intermittent "ambient-only" failure). Observed link
// cadence in device logs is ~one 20-byte packet per ~90ms, so pacing our writes
// near that avoids over-queueing. Tunable — lower if reliability holds, raise if
// drops persist. Costs ~(chunks × this) ms per request (e.g. 10×20 ≈ 200ms).
// 20ms (history 90→50→10→20): 10ms was over the line — device 2026-06-29 saw a SessionInfo
// request lose a chunk (car streamed only ambient `fields:[3]` acks until the resend
// recovered it, +8s connect). 20ms keeps ~2.5× the speedup of the old 50ms with double the
// margin of 10ms. Raise back toward 50 if the intermediate-ack-only loop recurs.
const BLE_CHUNK_INTERVAL_MS = 20
// Upper bound on a reassembled Tesla response frame. The largest we ever see is
// SessionInfo (~177B); commands/status are <60B. A declared length above this
// means the chunk is an orphan fragment (e.g. the tail of a frame whose head
// arrived before our callback was registered, then mis-read as a 2-byte length
// prefix → values like 9516/53666). Reject it instead of opening a multi-second
// bogus reassembly window that could swallow the real response.
const MAX_FRAME_SIZE = 2048
// Foreign-disconnect rejection window. The native mstConnect callback fires for
// ANY device's connection events (the paired phone's companion link cycles
// constantly) and easy-ble forwards them as ours. A connected car streams frames
// continuously (~1Hz auth beacons at minimum), so RX younger than this proves the
// link is alive and the disconnect event belongs to another device.
const FOREIGN_EVENT_RX_MS = 4000
const TESLA_NAME_PATTERN = /^S[a-f0-9]{16}C$/i
const CONNECTION_CONFIG = {
  // 8 s is enough for any successful Tesla GATT connect we've observed (350 ms
  // typical, 2.5 s worst case). Longer waits don't help and make debug cycles
  // painful — if 8 s elapses the native stack is either stuck or vehicle is
  // refusing us; reboots/disconnect-on-startup handle those cases. Used for the
  // FIRST dial of a connect burst.
  timeoutMs: 8000,
  // Shorter bound for RE-dials (session.js _doConnect attempts 2..N). The first dial
  // already proved the car is reachable; a re-dial that hasn't gotten a native connect
  // callback within this is hung, not slow (real connects are ~300ms). Failing fast
  // keeps the 4-attempt loop's worst case ~20s instead of 4×8s=32s.
  retryTimeoutMs: 4000,
  // Per-attempt setup bound (mirrors the Tesla Go SDK's maxLatency ~4s). A cold
  // car sometimes lets GATT discovery hang ~7s before dropping the link; this
  // fails the attempt fast so the retry loop can re-dial immediately instead of
  // waiting out the hang. Normal setup completes in ~1.4s (device-measured), so
  // 3s is a safe margin. See session.js _doConnect for the retry loop.
  setupWatchdogMs: 3000,
}
// LocalStorage key for the last successful native connect_id. Persisting it
// lets us call hmBle.mstDisconnect(savedId) on the NEXT app launch even if the
// previous run crashed without an onDestroy — clears the "native BLE poisoned"
// state that otherwise requires a watch reboot to recover from.
const LAST_CONNECT_ID_KEY = 'lastBleConnectId'
let _localStorage = null
const _ls = () => {
  if (!_localStorage) {
    try {
      _localStorage = new LocalStorage()
    } catch (_e) {}
  }
  return _localStorage
}
const _readSavedConnectId = () => {
  try {
    const ls = _ls()
    if (!ls) return null
    const raw = ls.getItem(LAST_CONNECT_ID_KEY)
    if (!raw) return null
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
  } catch (_e) {
    return null
  }
}
const _writeSavedConnectId = (id) => {
  try {
    const ls = _ls()
    if (!ls) return
    if (id === null || id === undefined) ls.removeItem(LAST_CONNECT_ID_KEY)
    else ls.setItem(LAST_CONNECT_ID_KEY, String(id))
  } catch (_e) {}
}
try {
  // easy-ble verbosity: 1 = errors only. Level 3 logged an `EXEC: …` line per chunk
  // write plus full profile-object dumps — the bulk of the BLE side-channel traffic.
  if (BLEMaster.SetDebugLevel) BLEMaster.SetDebugLevel(1)
} catch (_e) {}
const _dumpDevice = (d) => {
  if (!d) return '<null>'
  const parts = [`mac=${d.dev_addr}`, `name=${d.dev_name || '?'}`, `rssi=${d.rssi}`]
  if (d.uuid) parts.push(`uuid=${d.uuid}`)
  if (d.vendor_id !== undefined) parts.push(`vendorId=${d.vendor_id}`)
  if (d.vendor_data) parts.push(`vendorData=${d.vendor_data}`)
  if (d.service_uuid_array && d.service_uuid_array.length) parts.push(`services=[${d.service_uuid_array.join(',')}]`)
  if (d.service_data_array && d.service_data_array.length) parts.push(`svcData=${JSON.stringify(d.service_data_array)}`)
  return parts.join(' ')
}
const _frame = (data) => {
  const msg = new Uint8Array(2 + data.length)
  msg[0] = (data.length >> 8) & 0xff
  msg[1] = data.length & 0xff
  msg.set(data, 2)
  return msg
}
class TeslaBLE {
  constructor() {
    this.ble = null
    this.connected = false
    this.mac = null
    this.profile = null
    this.responseCallback = null
    // Persistent listener for UNSOLICITED vehicle pushes (periodic VehicleStatus
    // the car streams when a door opens, it locks, etc.). responseCallback owns
    // the link while a command/session request is in flight; when idle, frames
    // fall through to this so live state changes still reach the app. Stays armed
    // across pushes (never nulled by delivery) — only cleared on disconnect/reset.
    this.idleCallback = null
    // SDK-style address-keyed waiters. Each entry { match(payload)->bool, callback }
    // routes a reassembled frame to the request that owns its routing address — the
    // way the official Tesla dispatcher matches VCSEC responses (receiverKey = domain
    // + per-request random address). Checked BEFORE responseCallback/idleCallback so a
    // command's reply (addressed to its own per-request address) can never be eaten by a
    // concurrent status poll or the passive-entry responder sharing the single slot.
    // Persistent (multi-response): the registrant removes its own waiter on finish.
    this._waiters = []
    this.onDisconnect = null
    // Unexpected-link-loss hook, separate from onDisconnect (which the debug BLE
    // page owns): the session arms this on every connect to reset itself + flip
    // the facade offline when the native stack reports the link dead late.
    this.onLinkDown = null
    this.writeCompleteHandler = null
    this.charaValueHandler = null
    this.charaNotificationHandler = null
    this._lastResponseData = null
    this._lastResponseTime = 0
    this._lastRxTime = 0 // last raw chunk arrival — link-health signal (foreign-event filter)
    this._rxBuf = null
    this._rxExpected = 0
    this._rxLastChunkTime = 0
    // TX serialization. Chunked sends MUST NOT interleave: two concurrent 20-byte
    // chunk streams on the same characteristic corrupt BOTH frames (the car
    // reassembles by length prefix). Device capture 2026-06-11: GET_STATUS chunks
    // overlapped a passive-entry AuthenticationResponse → the car answered neither.
    this._txBusy = false
    this._txQueue = []
    // Inter-chunk write delay (see BLE_CHUNK_INTERVAL_MS). Instance-level so tests
    // can set it to 0 (pacing-agnostic) and so it can be tuned at runtime.
    this.chunkIntervalMs = BLE_CHUNK_INTERVAL_MS
    this.services = {
      [TESLA_SERVICE_UUID]: {
        [TESLA_WRITE_UUID]: [],
        [TESLA_READ_UUID]: ['2902'],
      },
    }
    // Defensive: if the previous app run died without a clean disconnect, the
    // native hmBle stack still thinks it owns a connection. New mstConnect
    // calls then return status:"failed" indefinitely until the watch reboots.
    // Calling mstDisconnect on the persisted connect_id reliably frees it.
    this._clearStaleNativeState('app-start')
  }
  _clearStaleNativeState(reason) {
    const saved = _readSavedConnectId()
    if (saved !== null) {
      console.log(`[BLE] Clearing stale native state (${reason}): mstDisconnect(${saved})`)
      try {
        hmBle.mstDisconnect(saved)
      } catch (e) {
        console.log('[BLE]   mstDisconnect threw (ignored):', e && e.message)
      }
      _writeSavedConnectId(null)
    }
    // Best-effort: stop any in-flight scan and drop any stale callbacks the
    // previous run left registered on the native singleton.
    try {
      hmBle.mstStopScan()
    } catch (_e) {}
    try {
      if (hmBle.mstOffAllCb) hmBle.mstOffAllCb()
    } catch (_e) {}
  }
  _ensureBLE() {
    if (!this.ble) this.ble = new BLEMaster()
    return this.ble
  }
  _cleanup() {
    if (this.ble) {
      try {
        if (this.ble.off) {
          if (this.ble.off.descWriteComplete) this.ble.off.descWriteComplete()
          if (this.ble.off.charaValueArrived) this.ble.off.charaValueArrived()
          if (this.ble.off.charaNotification) this.ble.off.charaNotification()
          if (this.ble.off.deregisterAll) this.ble.off.deregisterAll()
        }
        this.writeCompleteHandler = null
        this.charaValueHandler = null
        this.charaNotificationHandler = null
        this.ble.quit()
      } catch (e) {
        console.log('[BLE] Cleanup error (ignored):', e)
      }
      this.ble = null
    }
    // ble.quit() already issued mstDisconnect against the live connect_id; the
    // persisted copy is now stale, so clear it. (If quit() was a no-op because
    // we never connected, there's nothing to clear anyway.)
    _writeSavedConnectId(null)
    this.profile = null
    this.responseCallback = null
    this.idleCallback = null
    // Fail any address-routed requests still waiting — the link is gone, their replies
    // will never arrive, so let their callbacks settle (timeouts would too, but this is
    // immediate and frees the caller's busy flag).
    const orphans = this._waiters
    this._waiters = []
    for (let i = 0; i < orphans.length; i++) {
      try { orphans[i].callback({ success: false, error: 'Disconnected' }) } catch (_e) {}
    }
    this.mac = null
    this._rxBuf = null
    this._rxExpected = 0
    this._txBusy = false
    this._txQueue = []
  }
  scan(callback, duration = 10000, expectedName = null) {
    console.log(`[BLE] scan() start: duration=${duration}ms expectedName=${expectedName || '<none>'}`)
    const devices = []
    let completed = false
    const seen = new Set()
    const seenAll = new Set()
    const expectedLc = expectedName ? expectedName.toLowerCase() : null
    const onComplete = () => {
      if (completed) return
      completed = true
      console.log(`[BLE] scan() complete: ${seenAll.size} unique devices seen, ${devices.length} matched`)
      callback({ type: 'complete', devices })
    }
    const onDevice = (device) => {
      seenAll.add(device.dev_addr) // unique-device count for scan() complete
      if (!device.dev_name) return
      // When expectedName is given, require exact (case-insensitive) match — the
      // VIN-derived local name pins us to the right vehicle even with multiple
      // Teslas nearby. Otherwise fall back to the broad family-pattern filter.
      if (expectedLc) {
        if (device.dev_name.toLowerCase() !== expectedLc) return
      } else if (!TESLA_NAME_PATTERN.test(device.dev_name)) {
        return
      }
      // Dedupe per-call (easy-ble runs with allow_duplicates: true below so a
      // singleton BLEMaster doesn't carry a stale #device_set across scans).
      if (seen.has(device.dev_addr)) return
      seen.add(device.dev_addr)
      console.log(`[BLE] ✓ matched Tesla: ${_dumpDevice(device)}`)
      const found = { name: device.dev_name, mac: device.dev_addr, rssi: device.rssi, type: 'tesla' }
      devices.push(found)
      callback({ type: 'found', device: found, devices })
    }
    // allow_duplicates: true so easy-ble's #device_set doesn't suppress
    // re-advertisements (Tesla re-broadcasts; if we miss the first beacon for
    // any reason — or if a singleton BLEMaster carries the MAC across calls —
    // we still get the next one). Our onDevice early-returns after foundMAC is
    // set so duplicates are harmless in production and unblock tests where the
    // same MAC is emitted repeatedly across test cases.
    const started = this._ensureBLE().startScan(onDevice, {
      duration,
      allow_duplicates: true,
      on_duration: onComplete,
    })
    setTimeout(onComplete, duration + 500)
    return started
  }
  stopScan() {
    return this._ensureBLE().stopScan()
  }
  connect(mac, callback, timeoutMs) {
    // Each new connect attempt re-runs the defensive native cleanup. Costs
    // nothing if state is already clean; saves a reboot if the prior session
    // left something stuck.
    this._clearStaleNativeState('pre-connect')
    let done = false
    let setupStarted = false
    if (!timeoutMs) timeoutMs = CONNECTION_CONFIG.timeoutMs // caller (re-dials) can pass a shorter bound
    const dialStart = Date.now()

    console.log(`[BLE] connect() → ${mac} (timeout ${timeoutMs}ms)`)
    const timeout = setTimeout(() => {
      if (done) return
      done = true
      this.connected = false
      console.log(`[BLE] Connection timeout (${timeoutMs}ms)`)
      this._cleanup()
      callback({ success: false, error: 'Connection timeout' })
    }, timeoutMs)
    // Holds the setup-phase watchdog timer (armed once the link is up, see below).
    // Cleared on settle so a successful/aborted connect never trips it late.
    const setupDiag = []
    const settle = (result) => {
      if (done) return
      done = true
      clearTimeout(timeout)
      for (let i = 0; i < setupDiag.length; i++) clearTimeout(setupDiag[i])
      callback(result)
    }
    this._ensureBLE().connect(mac, (result) => {
      const elapsed = Date.now() - dialStart
      console.log(`[BLE] Native connect callback (after ${elapsed}ms): ${JSON.stringify(result)}`)
      if (done) {
        console.log('[BLE] (callback arrived AFTER JS timeout — native still works, JS gave up)')
        if (!result.connected) {
          // The native mstConnect callback fires for ANY device's connection
          // events — including the paired PHONE's companion link cycling — and
          // easy-ble forwards them indistinguishably as ours (device 2026-07-13:
          // a phone-link drop read as OUR car link dying reset a live session,
          // and the re-dial churn wedged the BLE stack until a Bluetooth
          // restart). A connected car streams frames continuously, so recent RX
          // proves the link is alive and this event belongs to another device.
          if (this.connected && Date.now() - this._lastRxTime < FOREIGN_EVENT_RX_MS) {
            console.log(`[BLE] Ignoring native disconnect: RX ${Date.now() - this._lastRxTime}ms ago — link alive, foreign device's event`)
            return
          }
          // Genuine late disconnect on a link we still believed was up (device
          // 2026-07-13: car-side drop surfaced only as this late callback, 40s
          // after dial — session/UI stayed "Connected" on a dead link and every
          // command failed silently). Fail in-flight waiters now and tell the
          // session via onLinkDown. Deliberate teardowns (disconnect()/recycle)
          // already flipped `connected` false, so they don't re-enter here.
          const wasUp = this.connected
          this.connected = false
          if (wasUp) {
            this._cleanup()
            if (this.onLinkDown) {
              try { this.onLinkDown() } catch (_e) {}
            }
          }
          if (this.onDisconnect) this.onDisconnect()
        }
        return
      }
      if (!result.connected) {
        console.log('[BLE] ⚠️ Vehicle disconnected! result:', JSON.stringify(result))
        this.connected = false
        if (setupStarted) {
          console.log('[BLE] Disconnect during setup, settling immediately')
          this._cleanup()
          settle({ success: false, error: 'Vehicle disconnected during setup' })
          return
        }
        console.log('[BLE] Connect failed:', result.status)
        this._cleanup()
        settle({ success: false, error: result.status || 'Connection failed' })
        return
      }
      if (setupStarted) {
        console.log('[BLE] Ignoring duplicate connected callback')
        return
      }
      setupStarted = true
      this.connected = true
      this.mac = mac
      // Persist connect_id NOW so that even if the app dies before any clean
      // disconnect, the next launch's _clearStaleNativeState can free it.
      try {
        const ble = this._ensureBLE()
        const connId = ble && ble.get && ble.get.connectionID && ble.get.connectionID()
        if (typeof connId === 'number') {
          _writeSavedConnectId(connId)
          console.log(`[BLE] Persisted connect_id=${connId} for crash-recovery cleanup`)
        }
      } catch (_e) {}
      // Setup MUST run synchronously inside this native connect callback. A
      // 400ms setTimeout gap here was device-tested 2026-06-25 and broke GATT
      // discovery entirely — startListener never called back (no CCCD, no
      // listener-failed) → 8s timeout, and it did NOT stop the cold first drop.
      // The cold first-connect drop is car-side; the retry is the only fix.
      console.log('[BLE] Connected, setting up profile immediately...')

      if (!this.connected) {
        this._cleanup()
        settle({ success: false, error: 'Connection lost during setup' })
        return
      }
      // Setup watchdog: a cold car sometimes lets GATT discovery hang (no
      // startListener callback, no CCCD) until it drops the link ~7s later, or
      // drops instantly — either way the first attempt is dead. Rather than wait
      // out the hang (or the 8s outer timeout), fail fast at setupWatchdogMs so
      // the retry loop re-dials immediately (mirrors the Tesla Go SDK bounding each
      // attempt). listenerReturned/cccdWritten are logged for attribution.
      const setupMs = Date.now()
      let listenerReturned = false
      let cccdWritten = false
      setupDiag.push(
        setTimeout(() => {
          if (done) return
          console.log(
            `[BLE] Setup watchdog (${CONNECTION_CONFIG.setupWatchdogMs}ms): ` +
              `listenerReturned=${listenerReturned} cccdWritten=${cccdWritten} — failing fast for retry`,
          )
          this.connected = false
          this._cleanup()
          settle({ success: false, error: 'Vehicle disconnected during setup' })
        }, CONNECTION_CONFIG.setupWatchdogMs),
      )
      this.profile = this._ensureBLE().generateProfileObject(this.services, {
        [TESLA_WRITE_UUID]: { value: 0x04 }, // WRITE_WITHOUT_RESPONSE
      })
      this._ensureBLE().startListener(this.profile, (response) => {
        if (done) return
        listenerReturned = true
        console.log(`[BLE] startListener returned after ${Date.now() - setupMs}ms, success=${response.success}`)
        if (!response.success) {
          this.connected = false
          console.log('[BLE] Listener failed:', response.message)
          this._cleanup()
          settle({ success: false, error: response.message || 'Listener failed' })
          return
        }
        // Defensive deregistration before re-registering callbacks (prevents duplicates on reconnect).
        const ble = this._ensureBLE()
        if (ble.off) {
          if (ble.off.charaValueArrived) ble.off.charaValueArrived()
          if (ble.off.charaNotification) ble.off.charaNotification()
          if (ble.off.descWriteComplete) ble.off.descWriteComplete()
        }
        this.charaValueHandler = (uuid, data, len) => {
          if (uuid.toUpperCase() === TESLA_READ_UUID.toUpperCase()) this._handleResponse(data, len)
        }
        ble.on.charaValueArrived(this.charaValueHandler)
        this.charaNotificationHandler = (uuid, data, len) => {
          if (uuid.toUpperCase() === TESLA_READ_UUID.toUpperCase()) this._handleResponse(data, len)
        }
        ble.on.charaNotification(this.charaNotificationHandler)
        this.writeCompleteHandler = () => {
          if (done) return
          // No MTU step: ZeppOS @zos/ble exposes no MTU-exchange or connection-param
          // API (mstConnect takes no options; there is no mstSetMTU — it was never a
          // real function). The link stays at the BLE default ATT MTU 23 = 20-byte
          // payload, confirmed on device 2026-06-03: the vehicle streamed its 177-byte
          // SessionInfo back as nine 20-byte notifications, and our writes cap at 20
          // too. So fixed 20-byte chunking is mandatory, not a tunable.
          cccdWritten = true
          console.log(`[BLE] CCCD confirmed, ready (setup ${Date.now() - setupMs}ms)`)
          settle({ success: true, mac })
        }
        ble.on.descWriteComplete(this.writeCompleteHandler)
        ble.write.descriptor(TESLA_READ_UUID, '2902', '0200')
        setTimeout(() => {
          if (!done) {
            console.log('[BLE] CCCD timeout fallback, continuing anyway')
            settle({ success: true, mac })
          }
        }, 4000)
      })
    })
  }
  disconnect() {
    this.connected = false
    this._cleanup()
  }
  // Deeper native cleanup for the session watchdog's recycle. disconnect()/quit()
  // frees the connection, but stale native RX callbacks and queued notification
  // fragments can still bleed into the next connection (observed: orphan frame
  // tails arriving right after a reconnect). Dropping all native callbacks +
  // stopping scans mirrors the relaunch-time _clearStaleNativeState that reliably
  // recovers a wedged link. Call AFTER disconnect() and BEFORE the next connect,
  // while no BLEMaster is attached, so only stale registrations are cleared.
  flushNative() {
    try {
      hmBle.mstStopScan()
    } catch (_e) {}
    try {
      if (hmBle.mstOffAllCb) hmBle.mstOffAllCb()
    } catch (_e) {}
  }
  reset() {
    this.connected = false
    this._cleanup()
    this.onDisconnect = null
    this.onLinkDown = null
    // Clear cross-frame dedup state — otherwise a fake-timer test that resets
    // jest's clock can be tricked into dropping the first response by matching
    // a stale signature from a previous test.
    this._lastResponseData = null
    this._lastResponseTime = 0
  }
  send(data, callback) {
    if (!this.connected) {
      callback({ success: false, error: 'Not connected' })
      return
    }
    // Wrap callback to support multi-response commands (e.g., unlock gets status push then action response).
    // The session layer signals "keep listening" by setting result._requeue during its callback — so the
    // re-registration MUST happen AFTER callback() returns, not on entry (the result has no _requeue yet
    // when _handleResponse first delivers it).
    const wrappedCallback = (result) => {
      this.responseCallback = null
      callback(result)
      if (result && result._requeue && this.responseCallback === null) {
        console.log('[BLE] Re-queuing callback for multi-response command')
        this.responseCallback = wrappedCallback
      }
    }
    this.responseCallback = wrappedCallback
    this._sendMessage(_frame(data))
    // Returned so the caller can release ONLY its own registration on teardown.
    // A timeout's blanket `responseCallback = null` clobbers whatever command
    // registered after it (device capture 2026-06-11: getVehicleStatus deadline
    // fired 1ms after a charge-port send and wiped its callback — the d3 reply
    // fell to the idle listener and the command timed out).
    return wrappedCallback
  }
  // Transmit a frame WITHOUT claiming the response slot — fire-and-forget. The
  // reply (if any) falls through to the idle/passive-entry listener. Use only for
  // messages whose response we don't need (wake): registering responseCallback
  // would gate the passive-entry responder for the wait, and wake's effect is on
  // TX anyway (a deep-asleep car never ACKs it).
  sendNoReply(data) {
    if (!this.connected) return false
    this._sendMessage(_frame(data))
    return true
  }
  // Send a frame that owns a per-request ROUTING ADDRESS (not the single response
  // slot). `match(payload)` returns true for the car's reply addressed back to this
  // request; matching frames are delivered to `callback` and the waiter STAYS armed
  // (the car may send several frames per request) until the caller removes it via the
  // returned token. Concurrent address-routed requests coexist without stealing each
  // other's replies — that's the whole point. Returns a token for removeWaiter().
  sendAddressed(data, match, callback) {
    if (!this.connected) {
      callback({ success: false, error: 'Not connected' })
      return null
    }
    const token = { match, callback }
    this._waiters.push(token)
    this._sendMessage(_frame(data))
    return token
  }
  removeWaiter(token) {
    if (!token) return
    const i = this._waiters.indexOf(token)
    if (i !== -1) this._waiters.splice(i, 1)
  }
  // Like sendNoReply, but writes EVERY chunk in this one JS turn (no setTimeout
  // pacing). For the app-close auto-lock only: onDestroy tears the process down
  // right after, so the normal chunk-at-a-time path (setTimeout 50ms × ~10) never
  // flushes past the first chunk. write.characteristic(...,true) is write-WITH-
  // response, so the native stack paces the back-to-back writes itself. Best-effort:
  // returns false if not connected.
  sendNoReplySync(data) {
    if (!this.connected) return false
    const message = _frame(data)
    for (let offset = 0; offset < message.length; offset += BLE_CHUNK_SIZE) {
      const chunk = message.slice(offset, Math.min(offset + BLE_CHUNK_SIZE, message.length))
      this._ensureBLE().write.characteristic(TESLA_WRITE_UUID, chunk.buffer, true)
    }
    return true
  }
  waitForNextResponse(timeout, callback) {
    const responseTimeout = setTimeout(() => {
      this.responseCallback = null
      callback({ success: false, error: 'NFC tap timeout' })
    }, timeout)
    this.responseCallback = (result) => {
      clearTimeout(responseTimeout)
      callback(result)
    }
  }
  sendAndWaitForResponse(data, callback, timeout = 30000) {
    if (!this.connected) {
      callback({ success: false, error: 'Not connected' })
      return
    }
    const responseTimeout = setTimeout(() => {
      console.log('[BLE] Response timeout')
      this.responseCallback = null
      callback({ success: false, error: 'Response timeout' })
    }, timeout)
    this._rxBuf = null
    this._rxExpected = 0
    this.responseCallback = (result) => {
      clearTimeout(responseTimeout)
      callback(result)
    }
    this._sendMessage(_frame(data))
  }
  _sendMessage(message) {
    // Always chunk at BLE_CHUNK_SIZE (20). The link is fixed at ATT MTU 23 = 20-byte
    // payload with no API to raise it (see connect()'s writeCompleteHandler), so every
    // write — even a sub-20B frame, which is just a single chunk — goes this path.
    // Serialized: a frame mid-chunking queues later frames (see _txBusy in ctor).
    if (this._txBusy) {
      this._txQueue.push(message)
      console.log(`[BLE] TX queued ${message.length}B (a send is mid-chunking)`)
      return
    }
    this._txBusy = true
    const total = Math.ceil(message.length / BLE_CHUNK_SIZE)
    console.log(`[BLE] TX ${message.length}B (${total} chunk(s) @ ${this.chunkIntervalMs}ms)`)
    this._sendChunk(message, 0)
  }
  _sendChunk(message, offset) {
    const end = Math.min(offset + BLE_CHUNK_SIZE, message.length)
    const chunk = message.slice(offset, end)
    this._ensureBLE().write.characteristic(TESLA_WRITE_UUID, chunk.buffer, true)
    if (end < message.length) {
      setTimeout(() => this._sendChunk(message, end), this.chunkIntervalMs)
      return
    }
    // Frame complete — release the TX lock and drain the queue (one chunk-interval
    // gap so the car's reassembler sees a clean frame boundary).
    this._txBusy = false
    if (this._txQueue.length > 0) {
      const next = this._txQueue.shift()
      setTimeout(() => this._sendMessage(next), this.chunkIntervalMs)
    }
  }
  _handleResponse(data, _len) {
    const chunk = new Uint8Array(data)
    // Link-health signal: ANY chunk arriving proves the link is alive right now.
    // Used to reject foreign-device disconnect events (see the connect callback).
    this._lastRxTime = Date.now()
    if (!this.responseCallback && !this.idleCallback && this._waiters.length === 0) return
    if (this._rxBuf === null) {
      const now = Date.now()
      // Dedup guard for genuinely repeated indications. Hash the WHOLE chunk
      // (FNV-1a): sampling a few bytes collides for distinct same-length frames
      // that differ only in the middle — e.g. the wake prod's ack vs the command's
      // ack, identical except for the echoed routing address. That collision
      // silently ate the command's terminal ack.
      let h = 0x811c9dc5
      for (let i = 0; i < chunk.length; i++) {
        h ^= chunk[i]
        h = (h * 0x01000193) >>> 0
      }
      const sig = `${chunk.length}_${h}`
      if (sig === this._lastResponseData && now - this._lastResponseTime < 200) {
        return // duplicate first chunk
      }
      this._lastResponseData = sig
      this._lastResponseTime = now
      if (chunk.length < 2) {
        // Only surface an error to an in-flight command; idle pushes ignore garbage.
        if (this.responseCallback) {
          const cb = this.responseCallback
          this.responseCallback = null
          cb({ success: false, error: 'Response too short' })
        }
        return
      }
      this._rxExpected = (chunk[0] << 8) | chunk[1]
      // Orphan/oversized guard: a length above any real frame means this chunk
      // isn't a genuine frame start (it's a stray fragment). Drop it, keep the
      // callback registered, and wait for a clean frame instead of starting a
      // doomed reassembly that times out ~1s later and may eat the real reply.
      if (this._rxExpected > MAX_FRAME_SIZE) {
        console.log(`[BLE] Ignoring orphan frame: declared ${this._rxExpected} bytes (cap ${MAX_FRAME_SIZE})`)
        this._rxExpected = 0
        return
      }
      this._rxBuf = chunk.slice(2)
      this._rxLastChunkTime = Date.now()
    } else {
      if (Date.now() - this._rxLastChunkTime > 1000) {
        console.log('[BLE] Stale reassembly buffer reset')
        this._rxBuf = null
        this._rxExpected = 0
        return
      }
      this._rxLastChunkTime = Date.now()
      const combined = new Uint8Array(this._rxBuf.length + chunk.length)
      combined.set(this._rxBuf)
      combined.set(chunk, this._rxBuf.length)
      this._rxBuf = combined
    }
    if (this._rxBuf.length < this._rxExpected) return
    const payload = this._rxBuf.slice(0, this._rxExpected)
    this._rxBuf = null
    this._rxExpected = 0
    // Address-routed waiters first: a frame addressed back to a specific request's
    // routing address belongs to THAT request, regardless of what else holds the
    // single response slot. Stays armed (multi-response); the registrant removes it.
    for (let i = 0; i < this._waiters.length; i++) {
      const w = this._waiters[i]
      let matched = false
      try { matched = w.match(payload) } catch (_e) {}
      if (matched) {
        console.log('[BLE] Got complete response:', payload.length, 'bytes (addr-matched)')
        w.callback({ success: true, data: payload })
        return
      }
    }
    // An in-flight command/session responseCallback takes priority and is one-shot
    // (nulled after delivery). When idle, the persistent idleCallback receives the
    // frame and stays armed for the next unsolicited push.
    const cb = this.responseCallback || this.idleCallback
    if (this.responseCallback) this.responseCallback = null
    if (!cb) return
    console.log('[BLE] Got complete response:', payload.length, 'bytes')
    cb({ success: true, data: payload })
  }
  isConnected() {
    return this.connected
  }
}
const teslaBLE = new TeslaBLE()
export default teslaBLE
export { CONNECTION_CONFIG, TESLA_READ_UUID, TESLA_SERVICE_UUID, TESLA_WRITE_UUID }
