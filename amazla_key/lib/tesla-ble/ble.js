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
// drops persist. Costs ~(chunks × this) ms per request (e.g. 10×50 ≈ 450ms).
// Trying 50ms (was 90) to cut command latency; watch for ambient-only failures.
const BLE_CHUNK_INTERVAL_MS = 50
// Upper bound on a reassembled Tesla response frame. The largest we ever see is
// SessionInfo (~177B); commands/status are <60B. A declared length above this
// means the chunk is an orphan fragment (e.g. the tail of a frame whose head
// arrived before our callback was registered, then mis-read as a 2-byte length
// prefix → values like 9516/53666). Reject it instead of opening a multi-second
// bogus reassembly window that could swallow the real response.
const MAX_FRAME_SIZE = 2048
const TESLA_NAME_PATTERN = /^S[a-f0-9]{16}C$/i
const CONNECTION_CONFIG = {
  // 8 s is enough for any successful Tesla GATT connect we've observed (350 ms
  // typical, 2.5 s worst case). Longer waits don't help and make debug cycles
  // painful — if 8 s elapses the native stack is either stuck or vehicle is
  // refusing us; reboots/disconnect-on-startup handle those cases.
  timeoutMs: 8000,
  stackStabilizeWait: 100, // Reduced from 2000ms - Tesla SDK has no delay
}
// LocalStorage key for the last successful native connect_id. Persisting it
// lets us call hmBle.mstDisconnect(savedId) on the NEXT app launch even if the
// previous run crashed without an onDestroy — clears the "native BLE poisoned"
// state that otherwise requires a watch reboot to recover from.
const LAST_CONNECT_ID_KEY = 'lastBleConnectId'
let _localStorage = null
const _ls = () => {
  if (!_localStorage) {
    try { _localStorage = new LocalStorage() } catch (_e) {}
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
  if (BLEMaster.SetDebugLevel) BLEMaster.SetDebugLevel(3)
} catch (_e) {}
const _hex = (buf) => {
  if (!buf) return '<null>'
  const arr = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf
  let s = ''
  const max = Math.min(arr.length, 128)
  for (let i = 0; i < max; i++) s += (arr[i] < 16 ? '0' : '') + arr[i].toString(16)
  return arr.length > max ? `${s}…(+${arr.length - max}B)` : s
}
const _dumpDevice = (d) => {
  if (!d) return '<null>'
  const parts = [`mac=${d.dev_addr}`, `name=${d.dev_name || '?'}`, `rssi=${d.rssi}`]
  if (d.uuid) parts.push(`uuid=${d.uuid}`)
  if (d.vendor_id !== undefined) parts.push(`vendorId=${d.vendor_id}`)
  if (d.vendor_data) parts.push(`vendorData=${d.vendor_data}`)
  if (d.service_uuid_array && d.service_uuid_array.length) parts.push(`services=[${d.service_uuid_array.join(',')}]`)
  if (d.service_data_array && d.service_data_array.length)
    parts.push(`svcData=${JSON.stringify(d.service_data_array)}`)
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
    this.onDisconnect = null
    this.writeCompleteHandler = null
    this.charaValueHandler = null
    this.charaNotificationHandler = null
    this._lastResponseData = null
    this._lastResponseTime = 0
    this._rxBuf = null
    this._rxExpected = 0
    this._rxLastChunkTime = 0
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
      try { hmBle.mstDisconnect(saved) } catch (e) { console.log('[BLE]   mstDisconnect threw (ignored):', e && e.message) }
      _writeSavedConnectId(null)
    }
    // Best-effort: stop any in-flight scan and drop any stale callbacks the
    // previous run left registered on the native singleton.
    try { hmBle.mstStopScan() } catch (_e) {}
    try { if (hmBle.mstOffAllCb) hmBle.mstOffAllCb() } catch (_e) {}
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
    this.mac = null
    this._rxBuf = null
    this._rxExpected = 0
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
      // Log EVERY advertisement once per address (so we can see exactly what's
      // on the air, including non-Tesla devices and Teslas not matching VIN).
      if (!seenAll.has(device.dev_addr)) {
        seenAll.add(device.dev_addr)
        console.log(`[BLE] adv: ${_dumpDevice(device)}`)
      }
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
  connect(mac, callback) {
    // Each new connect attempt re-runs the defensive native cleanup. Costs
    // nothing if state is already clean; saves a reboot if the prior session
    // left something stuck.
    this._clearStaleNativeState('pre-connect')
    let done = false
    let setupStarted = false
    const timeoutMs = CONNECTION_CONFIG.timeoutMs
    const dialStart = Date.now()

    console.log(`[BLE] connect() params:`)
    console.log(`[BLE]   target MAC = ${mac}`)
    console.log(`[BLE]   timeout    = ${timeoutMs}ms`)
    console.log(`[BLE]   service    = ${TESLA_SERVICE_UUID}`)
    console.log(`[BLE]   write char = ${TESLA_WRITE_UUID} (WRITE_WITHOUT_RESPONSE, perm=0x04)`)
    console.log(`[BLE]   read char  = ${TESLA_READ_UUID} (CCCD=2902)`)
    const timeout = setTimeout(() => {
      if (done) return
      done = true
      this.connected = false
      console.log(`[BLE] Connection timeout (${timeoutMs}ms)`)
      this._cleanup()
      callback({ success: false, error: 'Connection timeout' })
    }, timeoutMs)
    const settle = (result) => {
      if (done) return
      done = true
      clearTimeout(timeout)
      callback(result)
    }
    this._ensureBLE().connect(mac, (result) => {
      const elapsed = Date.now() - dialStart
      console.log(`[BLE] Native connect callback (after ${elapsed}ms): ${JSON.stringify(result)}`)
      if (done) {
        console.log('[BLE] (callback arrived AFTER JS timeout — native still works, JS gave up)')
        if (!result.connected) {
          this.connected = false
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
      console.log('[BLE] Connected, setting up profile immediately...')

      if (!this.connected) {
        this._cleanup()
        settle({ success: false, error: 'Connection lost during setup' })
        return
      }
      console.log('[BLE] Generating profile...')
      this.profile = this._ensureBLE().generateProfileObject(this.services, {
        [TESLA_WRITE_UUID]: { value: 0x04 }, // WRITE_WITHOUT_RESPONSE
      })
      try {
        console.log(`[BLE] Profile object: ${JSON.stringify(this.profile)}`)
      } catch (_e) {
        console.log('[BLE] Profile object (non-serializable):', this.profile)
      }

      console.log('[BLE] Starting listener...')
      this._ensureBLE().startListener(this.profile, (response) => {
        console.log('[BLE] Listener response:', JSON.stringify(response))
        if (done) return
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
          console.log(`[BLE] charaValueArrived: uuid=${uuid} len=${len} hex=${_hex(data)}`)
          if (uuid.toUpperCase() === TESLA_READ_UUID.toUpperCase()) this._handleResponse(data, len)
        }
        ble.on.charaValueArrived(this.charaValueHandler)
        this.charaNotificationHandler = (uuid, data, len) => {
          console.log(`[BLE] charaNotification: uuid=${uuid} len=${len} hex=${_hex(data)}`)
          if (uuid.toUpperCase() === TESLA_READ_UUID.toUpperCase()) this._handleResponse(data, len)
        }
        ble.on.charaNotification(this.charaNotificationHandler)
        this.writeCompleteHandler = (chara, desc, status) => {
          console.log(`[BLE] descWriteComplete: chara=${chara} desc=${desc} status=${status}`)
          if (done) return
          // No MTU step: ZeppOS @zos/ble exposes no MTU-exchange or connection-param
          // API (mstConnect takes no options; there is no mstSetMTU — it was never a
          // real function). The link stays at the BLE default ATT MTU 23 = 20-byte
          // payload, confirmed on device 2026-06-03: the vehicle streamed its 177-byte
          // SessionInfo back as nine 20-byte notifications, and our writes cap at 20
          // too. So fixed 20-byte chunking is mandatory, not a tunable.
          console.log('[BLE] CCCD confirmed, ready')
          settle({ success: true, mac })
        }
        ble.on.descWriteComplete(this.writeCompleteHandler)
        console.log(`[BLE] Enabling indications: CCCD write → chara=${TESLA_READ_UUID} desc=2902 data=0200 (indications)`)
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
    try { hmBle.mstStopScan() } catch (_e) {}
    try { if (hmBle.mstOffAllCb) hmBle.mstOffAllCb() } catch (_e) {}
  }
  reset() {
    this.connected = false
    this._cleanup()
    this.onDisconnect = null
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
    console.log(`[BLE] TX framed (${message.length}B) hex=${_hex(message)}`)
    const total = Math.ceil(message.length / BLE_CHUNK_SIZE)
    console.log(`[BLE]   → ${total} chunk(s) of ${BLE_CHUNK_SIZE}B (${this.chunkIntervalMs}ms paced)`)
    this._sendChunk(message, 0)
  }
  _sendChunk(message, offset) {
    const end = Math.min(offset + BLE_CHUNK_SIZE, message.length)
    const chunk = message.slice(offset, end)
    console.log(`[BLE]   TX chunk [${offset}..${end}]: hex=${_hex(chunk)}`)
    this._ensureBLE().write.characteristic(TESLA_WRITE_UUID, chunk.buffer, true)
    if (end < message.length) setTimeout(() => this._sendChunk(message, end), this.chunkIntervalMs)
  }
  _handleResponse(data, _len) {
    const chunk = new Uint8Array(data)
    console.log(`[BLE] RX notification: ${chunk.length} bytes`)

    if (!this.responseCallback) {
      console.log('[BLE] No response callback, ignoring')
      return
    }
    if (this._rxBuf === null) {
      const now = Date.now()
      // Dedup guard for genuinely repeated indications. chunk[0]/chunk[1] are just
      // the frame-length prefix, so sampling only those collides for any two distinct
      // messages of equal length (e.g. a command response followed by a same-length
      // status push). Sample payload bytes (first two after the prefix + last byte) too.
      const last = chunk[chunk.length - 1] || 0
      const sig = `${chunk.length}_${chunk[2] || 0}_${chunk[3] || 0}_${last}`
      if (sig === this._lastResponseData && now - this._lastResponseTime < 200) {
        console.log('[BLE] Duplicate first chunk ignored')
        return
      }
      this._lastResponseData = sig
      this._lastResponseTime = now
      if (chunk.length < 2) {
        console.log(`[BLE] First chunk too short: ${chunk.length} bytes`)
        const cb = this.responseCallback
        this.responseCallback = null
        cb({ success: false, error: 'Response too short' })
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
      console.log(`[BLE] Starting reassembly: expect ${this._rxExpected} bytes, first chunk has ${this._rxBuf.length}`)
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
      console.log(`[BLE] Continuing reassembly: got ${combined.length} / ${this._rxExpected} bytes`)
    }
    if (this._rxBuf.length < this._rxExpected) return
    const payload = this._rxBuf.slice(0, this._rxExpected)
    this._rxBuf = null
    this._rxExpected = 0
    const cb = this.responseCallback
    this.responseCallback = null
    console.log('[BLE] Got complete response:', payload.length, 'bytes')
    cb({ success: true, data: payload })
  }
  isConnected() {
    return this.connected
  }
  getMAC() {
    return this.mac
  }
}
const teslaBLE = new TeslaBLE()
export default teslaBLE
export { TESLA_SERVICE_UUID, TESLA_WRITE_UUID, TESLA_READ_UUID, CONNECTION_CONFIG }
