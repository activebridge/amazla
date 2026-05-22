import {
  mstBuildProfile,
  mstConnect,
  mstDestroyProfileInstance,
  mstDisconnect,
  mstOffAllCb,
  mstOnCharaNotification,
  mstOnCharaValueArrived,
  mstOnDescWriteComplete,
  mstOnPrepare,
  mstStartScan,
  mstStopScan,
  mstWriteCharacteristic,
  mstWriteDescriptor,
} from '@zos/ble'
import { bytesToHex } from './crypto/binary-utils.js'

const TESLA_SERVICE_UUID = '00000211-b2d1-43f0-9b88-960cebf8b91e'
const TESLA_WRITE_UUID = '00000212-b2d1-43f0-9b88-960cebf8b91e'
const TESLA_READ_UUID = '00000213-b2d1-43f0-9b88-960cebf8b91e'
const TESLA_READ_UUID_UC = TESLA_READ_UUID.toUpperCase()
const CCCD_ENABLE = new Uint8Array([0x02, 0x00])
const BLE_CHUNK_SIZE = 20
const TESLA_NAME_PATTERN = /^S[a-f0-9]{16}C$/i
const CONNECTION_CONFIG = {
  timeouts: [5000, 8000, 10000],
  // 50ms guard between mstOnPrepare registration and mstBuildProfile.
  // Mirrors @silver-zepp/easy-ble's SHORT_DELAY — defensive against firmware
  // that fires the prepare event synchronously inside mstBuildProfile before
  // the handler is fully wired. Tests override to 0 to keep flow synchronous.
  prepareDelayMs: 50,
}

// MAC string "AA:BB:CC:DD:EE:FF" → 6-byte ArrayBuffer (no split/array allocation)
const _macToBuffer = (mac) => {
  const buf = new Uint8Array(6)
  for (let i = 0; i < 6; i++) buf[i] = parseInt(mac.slice(i * 3, i * 3 + 2), 16)
  return buf.buffer
}

// Profile object shape mirrors @silver-zepp/easy-ble generateProfileObject —
// required keys: pair:true, outer list[0] {uuid:true,size,len}, service {len1,len2},
// characteristic {desc,len}, descriptor {permission}. Missing any of these causes
// mstBuildProfile to return non-zero status via mstOnPrepare ("GATT profile failed").
const _buildProfileObj = (connectId, macBuffer) => ({
  pair: true,
  id: connectId,
  profile: 'tesla',
  dev: macBuffer,
  len: 1,
  list: [
    {
      uuid: true,
      size: 1,
      len: 1,
      list: [
        {
          uuid: TESLA_SERVICE_UUID,
          permission: 0,
          len1: 2,
          len2: 2,
          list: [
            // WRITE_WITHOUT_RESPONSE
            { uuid: TESLA_WRITE_UUID, permission: 0x04, desc: 0, len: 0, list: [] },
            // NOTIFY/INDICATE with CCCD (2902)
            {
              uuid: TESLA_READ_UUID,
              permission: 0x20,
              desc: 1,
              len: 1,
              list: [{ uuid: '2902', permission: 0x20 }],
            },
          ],
        },
      ],
    },
  ],
})

const _frame = (data) => {
  const msg = new Uint8Array(2 + data.length)
  msg[0] = (data.length >> 8) & 0xff
  msg[1] = data.length & 0xff
  msg.set(data, 2)
  return msg
}

class TeslaBLENative {
  constructor() {
    this.connected = false
    this.mac = null
    this._connectId = null
    this._profile = null // mstBuildProfile pointer (number)
    this._macBuffer = null
    this.responseCallback = null
    this.onDisconnect = null
    this._rxBuf = null
    this._rxExpected = 0
    this._rxLastChunkTime = 0
    this._lastFirstChunkSig = null
    this._lastFirstChunkTime = 0
  }

  _cleanup() {
    // Drop all native BLE callbacks before destroying the profile so the next
    // connect() doesn't stack duplicate notification/desc-write handlers (which
    // would corrupt multi-chunk reassembly across pair retries). Mirrors easy-ble.
    try { mstOffAllCb() } catch (_e) {}
    if (this._profile !== null) {
      try {
        mstDestroyProfileInstance(this._profile)
      } catch (_e) {}
      this._profile = null
    }
    if (this._connectId !== null) {
      try {
        mstDisconnect(this._connectId)
      } catch (_e) {}
      this._connectId = null
    }
    this.connected = false
    this.mac = null
    this._macBuffer = null
    this.responseCallback = null
    this._rxBuf = null
    this._rxExpected = 0
    this._lastFirstChunkSig = null
    this._lastFirstChunkTime = 0
  }

  scan(callback, duration = 10000, expectedName = null) {
    const devices = []
    let completed = false
    const expectedLc = expectedName ? expectedName.toLowerCase() : null
    const onComplete = () => {
      if (completed) return
      completed = true
      callback({ type: 'complete', devices })
    }
    mstStartScan(
      (result) => {
        if (!result || !result.dev_name) return
        if (expectedLc) {
          if (result.dev_name.toLowerCase() !== expectedLc) return
        } else if (!TESLA_NAME_PATTERN.test(result.dev_name)) {
          return
        }
        // dev_addr is ArrayBuffer — convert to "AA:BB:CC:DD:EE:FF" string
        const bytes = new Uint8Array(result.dev_addr)
        let mac = ''
        for (let i = 0; i < 6; i++) {
          if (i) mac += ':'
          mac += bytes[i].toString(16).padStart(2, '0').toUpperCase()
        }
        const found = { name: result.dev_name, mac, rssi: result.rssi, type: 'tesla' }
        devices.push(found)
        callback({ type: 'found', device: found, devices })
      },
      { duration, allow_duplicates: false },
    )
    setTimeout(onComplete, duration + 500)
    return true
  }

  stopScan() {
    return mstStopScan()
  }

  connect(mac, callback, attemptNumber = 0) {
    let done = false
    let setupStarted = false
    const timeoutMs =
      CONNECTION_CONFIG.timeouts[attemptNumber] || CONNECTION_CONFIG.timeouts[CONNECTION_CONFIG.timeouts.length - 1]
    console.log(`[BLE] Connecting to: ${mac} (attempt ${attemptNumber + 1}, ${timeoutMs}ms timeout)`)

    const timeout = setTimeout(() => {
      if (done) return
      done = true
      this.connected = false
      console.log(`[BLE] Connection timeout (${timeoutMs}ms)`)
      this._cleanup()
      callback({ success: false, error: 'Connection timeout', attemptNumber })
    }, timeoutMs)

    const settle = (result) => {
      if (done) return
      done = true
      clearTimeout(timeout)
      callback(result)
    }

    const macBuffer = _macToBuffer(mac)
    this._macBuffer = macBuffer

    mstConnect(macBuffer, (result) => {
      console.log(`[BLE] Connect callback fired: connected=${result.connected}`)

      // connected: 0=success, 1=failed, 2=disconnected
      if (result.connected === 2) {
        // Disconnect event
        this.connected = false
        if (done) {
          // Post-connection disconnect — connection was already established
          if (this.onDisconnect) this.onDisconnect()
          return
        }
        if (setupStarted) {
          console.log('[BLE] Disconnect during setup')
          this._cleanup()
          settle({ success: false, error: 'Vehicle disconnected during setup', attemptNumber })
          return
        }
        settle({ success: false, error: 'Connection failed', attemptNumber })
        return
      }

      if (result.connected === 1) {
        console.log('[BLE] Connection failed')
        this._cleanup()
        settle({ success: false, error: 'Connection failed', attemptNumber })
        return
      }

      // connected === 0: success
      if (setupStarted) {
        console.log('[BLE] Ignoring duplicate connected callback')
        return
      }
      setupStarted = true
      this.connected = true
      this.mac = mac
      this._connectId = result.connect_id

      console.log(`[BLE] Connected (id=${this._connectId}), building GATT profile...`)

      // Register prepare callback before building profile.
      // All mstOn* callbacks receive a single response object — destructure, do not use positional args.
      mstOnPrepare((response) => {
        const { profile, status } = response || {}
        console.log(`[BLE] mstOnPrepare: profile=${profile} status=${status}`)
        if (done) return
        if (status !== 0) {
          console.log(`[BLE] Profile prepare failed: ${status}`)
          this._cleanup()
          settle({ success: false, error: `GATT profile failed: ${status}`, attemptNumber })
          return
        }
        this._profile = profile

        // Subscribe to BOTH event streams. ZeppOS firmware routes some payloads through
        // mstOnCharaNotification (notifications) and others through mstOnCharaValueArrived
        // (indications/read responses). Old ble.js did this via easy-ble; native must too.
        // _handleResponse dedupes on first-chunk signature so double-delivery is harmless.
        // No profile-id filter — single connection, and some firmware passes a different
        // profile value here than in mstOnPrepare. UUID match alone is reliable.
        const onChara = (resp) => {
          const { uuid, data } = resp || {}
          if (uuid && uuid.toUpperCase() === TESLA_READ_UUID_UC) this._handleResponse(data)
        }
        mstOnCharaNotification(onChara)
        mstOnCharaValueArrived(onChara)

        // Register CCCD write-complete handler then write CCCD — no QueueManager, direct call
        mstOnDescWriteComplete((resp) => {
          const { chara, desc, status: wstatus } = resp || {}
          console.log(`[BLE] descWriteComplete chara=${chara} desc=${desc} status=${wstatus}`)
          if (done) return
          console.log('[BLE] CCCD confirmed, ready')
          settle({ success: true, mac })
        })

        // Write CCCD to enable indications (0x0002)
        console.log('[BLE] Enabling indications (CCCD=0x0002)...')
        mstWriteDescriptor(profile, TESLA_READ_UUID, '2902', CCCD_ENABLE.buffer, 2)

        // Fallback if CCCD write-complete never fires
        setTimeout(() => {
          if (!done) {
            console.log('[BLE] CCCD timeout fallback, continuing anyway')
            settle({ success: true, mac })
          }
        }, 4000)
      })

      const profileObj = _buildProfileObj(this._connectId, macBuffer)
      if (CONNECTION_CONFIG.prepareDelayMs > 0) {
        setTimeout(() => mstBuildProfile(profileObj), CONNECTION_CONFIG.prepareDelayMs)
      } else {
        mstBuildProfile(profileObj)
      }
    })
  }

  disconnect() {
    this.connected = false
    this._cleanup()
  }

  reset() {
    this.connected = false
    this.onDisconnect = null
    this._cleanup()
  }

  send(data, callback) {
    if (!this.connected) {
      callback({ success: false, error: 'Not connected' })
      return
    }
    console.log(`[BLE TX] ${bytesToHex(data)}`)
    const wrappedCallback = (result) => {
      if (result.success && result._requeue) {
        console.log('[BLE] Re-queuing callback for multi-response command')
        this.responseCallback = wrappedCallback
        return
      }
      this.responseCallback = null
      callback(result)
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
    console.log(`[BLE TX] ${bytesToHex(data)}`)
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
    if (message.length <= BLE_CHUNK_SIZE) {
      console.log(`[BLE] TX ${message.length} bytes (single write)`)
      mstWriteCharacteristic(this._profile, TESLA_WRITE_UUID, message.buffer, message.length)
    } else {
      const total = Math.ceil(message.length / BLE_CHUNK_SIZE)
      console.log(`[BLE] TX ${message.length} bytes in ${total} chunks (20ms paced)`)
      this._sendChunk(message, 0)
    }
  }

  _sendChunk(message, offset) {
    const end = Math.min(offset + BLE_CHUNK_SIZE, message.length)
    const chunk = message.slice(offset, end)
    mstWriteCharacteristic(this._profile, TESLA_WRITE_UUID, chunk.buffer, chunk.length)
    if (end < message.length) setTimeout(() => this._sendChunk(message, end), 20)
  }

  _handleResponse(data) {
    const chunk = new Uint8Array(data)
    console.log(`[BLE] RX notification: ${chunk.length} bytes`)

    if (!this.responseCallback) {
      console.log('[BLE] No response callback, ignoring')
      return
    }
    if (this._rxBuf === null) {
      const now = Date.now()
      if (chunk.length < 2) {
        console.log(`[BLE] First chunk too short: ${chunk.length} bytes`)
        const cb = this.responseCallback
        this.responseCallback = null
        cb({ success: false, error: 'Response too short' })
        return
      }
      // Dedup: same first-chunk signature within 200ms means both charaNotification
      // and charaValueArrived fired for the same payload (firmware-dependent).
      const sig = `${chunk.length}_${chunk[0]}_${chunk[1]}_${chunk[2] || 0}`
      if (sig === this._lastFirstChunkSig && now - this._lastFirstChunkTime < 200) {
        console.log('[BLE] Duplicate first chunk ignored')
        return
      }
      this._lastFirstChunkSig = sig
      this._lastFirstChunkTime = now
      this._rxExpected = (chunk[0] << 8) | chunk[1]
      this._rxBuf = chunk.slice(2)
      this._rxLastChunkTime = now
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
    console.log(`[BLE] Got complete response: ${payload.length} bytes`)
    console.log(`[BLE RX] ${bytesToHex(payload)}`)
    cb({ success: true, data: payload })
  }

  isConnected() {
    return this.connected
  }
  getMAC() {
    return this.mac
  }
}

const teslaBLENative = new TeslaBLENative()
export default teslaBLENative
export { TESLA_SERVICE_UUID, TESLA_WRITE_UUID, TESLA_READ_UUID, CONNECTION_CONFIG }
