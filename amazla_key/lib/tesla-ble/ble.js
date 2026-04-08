import { BLEMaster } from "@silver-zepp/easy-ble"
const TESLA_SERVICE_UUID = "00000211-b2d1-43f0-9b88-960cebf8b91e"
const TESLA_WRITE_UUID = "00000212-b2d1-43f0-9b88-960cebf8b91e"
const TESLA_READ_UUID = "00000213-b2d1-43f0-9b88-960cebf8b91e"
const BLE_CHUNK_SIZE = 20
const TESLA_NAME_PATTERN = /^S[a-f0-9]{16}C$/i
const CONNECTION_CONFIG = {
  timeouts: [5000, 8000, 10000],
  maxAttempts: 3,
  retryDelayMs: 2000,
}
const _frame = (data) => {
  const msg = new Uint8Array(2 + data.length)
  msg[0] = (data.length >> 8) & 0xFF
  msg[1] = data.length & 0xFF
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
    this.pendingResponseCallbacks = []  // Queue for multi-response commands
    this.onDisconnect = null
    this.writeCompleteHandler = null
    this.charaValueHandler = null
    this.charaNotificationHandler = null
    this.gattReady = false  // Track if startListener completed
    this._lastResponseData = null
    this._lastResponseTime = 0
    this._rxBuf = null
    this._rxExpected = 0
    this._rxLastChunkTime = 0
    this._mtu = 20
    this.services = {
      [TESLA_SERVICE_UUID]: {
        [TESLA_WRITE_UUID]: [],
        [TESLA_READ_UUID]: ["2902"],
      }
    }
  }
  _ensureBLE() {
    if (!this.ble) this.ble = new BLEMaster()
    return this.ble
  }
  _cleanup() {
    if (this.ble) {
      try {
        if (this.writeCompleteHandler) {
          this.ble.off?.descWriteComplete?.()
          this.writeCompleteHandler = null
        }
        if (this.charaValueHandler) {
          this.ble.off?.charaValueArrived?.(this.charaValueHandler)
          this.charaValueHandler = null
        }
        if (this.charaNotificationHandler) {
          this.ble.off?.charaNotification?.(this.charaNotificationHandler)
          this.charaNotificationHandler = null
        }
        this.ble.off?.deregisterAll?.()
        this.ble.quit()
      } catch (e) {
        console.log('[BLE] Cleanup error (ignored):', e)
      }
      this.ble = null
    }
    this.profile = null
    this.responseCallback = null
    this.pendingResponseCallbacks = []
    this.mac = null
    this.gattReady = false
    this._rxBuf = null
    this._rxExpected = 0
    this._mtu = 20
  }
  scan(callback, duration = 10000) {
    const devices = []
    let completed = false
    const onComplete = () => {
      if (completed) return
      completed = true
      callback({ type: 'complete', devices })
    }
    const onDevice = (device) => {
      if (!device.dev_name || !TESLA_NAME_PATTERN.test(device.dev_name)) return
      const found = { name: device.dev_name, mac: device.dev_addr, rssi: device.rssi, type: 'tesla' }
      devices.push(found)
      callback({ type: 'found', device: found, devices })
    }
    const started = this._ensureBLE().startScan(onDevice, {
      duration,
      allow_duplicates: false,
      on_duration: onComplete
    })
    setTimeout(onComplete, duration + 500)
    return started
  }
  stopScan() {
    return this._ensureBLE().stopScan()
  }
  connect(mac, callback, attemptNumber = 0) {
    let done = false
    let setupStarted = false
    const timeoutMs = CONNECTION_CONFIG.timeouts[attemptNumber] || CONNECTION_CONFIG.timeouts[CONNECTION_CONFIG.timeouts.length - 1]
    const attemptLabel = `${attemptNumber + 1}/${CONNECTION_CONFIG.maxAttempts}`
    
    console.log('[BLE] Connecting to: ' + mac + ' (attempt ' + attemptLabel + ', ' + timeoutMs + 'ms timeout)')
    
    // CRITICAL: Must disconnect first to clear any lingering BLE state
    // If previous connection attempt left the BLE object in a partial state,
    // the vehicle firmware might reject the new connection
    this.disconnect()
    
    const timeout = setTimeout(() => {
      if (done) return
      done = true
      this.connected = false
      console.log('[BLE] Connection timeout (' + timeoutMs + 'ms)')
      this._cleanup()
      callback({ success: false, error: 'Connection timeout', attemptNumber })
    }, timeoutMs)
    const settle = (result) => {
      if (done) return
      done = true
      clearTimeout(timeout)
      callback(result)
    }
    this._ensureBLE().connect(mac, (result) => {
      console.log('[BLE] Connect callback fired:', JSON.stringify(result), 'done=' + done, 'setupStarted=' + setupStarted)
      if (done) {
        if (!result.connected) {
          this.connected = false
          if (this.onDisconnect) this.onDisconnect()
        }
        return
      }
      if (!result.connected) {
        console.log('[BLE] ⚠️ Vehicle disconnected during setup=' + setupStarted, JSON.stringify(result))
        this.connected = false
        if (setupStarted) {
          console.log('[BLE] ✗ DISCONNECT DURING PROFILE/LISTENER SETUP')
          this._cleanup()
          settle({ success: false, error: 'Vehicle disconnected during setup', attemptNumber })
          return
        }
        console.log('[BLE] Connect failed:', result.status)
        this._cleanup()
        settle({ success: false, error: result.status || 'Connection failed', attemptNumber })
        return
      }
      if (setupStarted) {
        console.log('[BLE] Ignoring duplicate connected callback')
        return
      }
      setupStarted = true
      this.connected = true
      this.mac = mac
      console.log('[BLE] Connected, building GATT profile (pair=false, no discovery)...')

      // Build a profile with pair:false — provides Tesla characteristic UUIDs directly
      // without triggering GATT attribute discovery (which disconnects Tesla firmware).
      const macBytes = mac.split(':').map(function(b) { return parseInt(b, 16) })
      const macAB = new Uint8Array(macBytes).buffer
      const connectId = this._ensureBLE().get.connectionID()
      const profileObject = {
        pair: false,
        id: connectId,
        profile: 'TeslaVCSEC',
        dev: macAB,
        len: 1,
        list: [{
          uuid: true,
          size: 1,
          len: 1,
          list: [{
            uuid: TESLA_SERVICE_UUID,
            permission: 0,
            len1: 2,
            len2: 2,
            list: [
              { uuid: TESLA_WRITE_UUID, permission: 32, desc: 0, len: 0 },
              { uuid: TESLA_READ_UUID,  permission: 32, desc: 1, len: 1,
                list: [{ uuid: '2902', permission: 32 }] }
            ]
          }]
        }]
      }

      const self = this

      const setupHandlers = function() {
        self.charaValueHandler = function(uuid, data, len) {
          console.log('[BLE] charaValueArrived:', uuid, len)
          if (uuid.toUpperCase() === TESLA_READ_UUID.toUpperCase()) self._handleResponse(data, len)
        }
        self.charaNotificationHandler = function(uuid, data, len) {
          console.log('[BLE] charaNotification:', uuid, len)
          if (uuid.toUpperCase() === TESLA_READ_UUID.toUpperCase()) self._handleResponse(data, len)
        }
        try { self._ensureBLE().on.charaValueArrived(self.charaValueHandler) }
        catch (e) { console.log('[BLE] charaValueArrived reg failed:', e.message || e) }
        try { self._ensureBLE().on.charaNotification(self.charaNotificationHandler) }
        catch (e) { console.log('[BLE] charaNotification reg failed:', e.message || e) }

        // Register descWriteComplete BEFORE writing CCCD.
        // Without this, easy-ble's QueueManager polls for the write-complete flag every
        // 100ms and times out after 5000ms — blocking SessionInfoRequest by 5 seconds.
        try { self._ensureBLE().on.descWriteComplete(function(_c, _d, status) {
          console.log('[BLE] CCCD write complete, status:', status)
        }) } catch (e) { console.log('[BLE] descWriteComplete reg failed:', e.message || e) }

        // Enable indications (0x0200). Queue will unblock promptly once vehicle responds.
        try {
          console.log('[BLE] Enabling CCCD (indications)...')
          self._ensureBLE().write.descriptor(TESLA_READ_UUID, '2902', '0200')
        } catch (e) { console.log('[BLE] CCCD failed:', e.message || e) }

        console.log('[BLE] Handlers registered, settling connection...')
        settle({ success: true, mac })
      }

      const applyGATTReady = function(listenerResult, profileLabel) {
        if (done) return
        if (!listenerResult.success) {
          if (profileLabel === 'pair:false') {
            // Fallback: null profile — ZeppOS assigns a profile_pid without GATT discovery
            console.log('[BLE] pair:false failed (' + listenerResult.message + '), trying null profile fallback...')
            self._ensureBLE().startListener(null, function(r) { applyGATTReady(r, 'null') })
          } else {
            console.log('[BLE] GATT profile setup failed (' + profileLabel + '):', listenerResult.message, listenerResult.code)
            self._cleanup()
            settle({ success: false, error: 'GATT setup failed: ' + (listenerResult.message || listenerResult.code) })
          }
          return
        }
        console.log('[BLE] GATT profile ready (' + profileLabel + '), registering handlers...')
        self.gattReady = true
        setupHandlers()
      }

      this._ensureBLE().startListener(profileObject, function(r) { applyGATTReady(r, 'pair:false') })
    })
  }
  disconnect() {
    this.connected = false
    this._cleanup()
  }
  reset() {
    this.connected = false
    this._cleanup()
    this.onDisconnect = null
  }
  send(data, callback) {
    if (!this.connected) {
      callback({ success: false, error: 'Not connected' })
      return
    }
    
    // Wrap the callback to support re-queuing for multi-response commands
    const wrappedCallback = (result) => {
      if (result.success && result._requeue) {
        // Command wants to wait for another response (e.g., lock/unlock gets status push then action response)
        // Don't call user callback, just re-register for next response
        console.log('[BLE] Re-queuing callback for multi-response command')
        this.responseCallback = wrappedCallback
        return
      }
      // Normal flow: clear callback and call user's callback with result
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
    
    this._doSendAndWait(data, callback, timeout)
  }
  
  _doSendAndWait(data, callback, timeout) {
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
    if (message.length <= this._mtu) {
      console.log('[BLE] TX', message.length, 'bytes (single write)')
      this._ensureBLE().write.characteristic(TESLA_WRITE_UUID, message.buffer, true)
    } else {
      const total = Math.ceil(message.length / BLE_CHUNK_SIZE)
      console.log('[BLE] TX', message.length, 'bytes in', total, 'chunks (20ms paced)')
      this._sendChunk(message, 0)
    }
  }
  _sendChunk(message, offset) {
    const end = Math.min(offset + BLE_CHUNK_SIZE, message.length)
    const chunk = message.slice(offset, end)
    this._ensureBLE().write.characteristic(TESLA_WRITE_UUID, chunk.buffer, true)
    if (end < message.length) setTimeout(() => this._sendChunk(message, end), 20)
  }
  _handleResponse(data, _len) {
    const chunk = new Uint8Array(data)
    const chunkHex = Array.from(chunk.slice(0, Math.min(20, chunk.length)), x => x.toString(16).padStart(2, '0')).join('')
    console.log('[BLE] RX notification: ' + chunk.length + ' bytes, hex=' + chunkHex + (chunk.length > 20 ? '...' : ''))
    
    if (!this.responseCallback) {
      console.log('[BLE] No response callback, ignoring')
      return
    }
    if (this._rxBuf === null) {
      const now = Date.now()
      const sig = chunk.length + '_' + (chunk[0] || 0) + '_' + (chunk[1] || 0)
      if (sig === this._lastResponseData && (now - this._lastResponseTime) < 200) {
        console.log('[BLE] Duplicate first chunk ignored')
        return
      }
      this._lastResponseData = sig
      this._lastResponseTime = now
      if (chunk.length < 2) {
        console.log('[BLE] First chunk too short: ' + chunk.length + ' bytes')
        const cb = this.responseCallback
        this.responseCallback = null
        cb({ success: false, error: 'Response too short' })
        return
      }
      this._rxExpected = (chunk[0] << 8) | chunk[1]
      this._rxBuf = chunk.slice(2)
      this._rxLastChunkTime = Date.now()
      console.log('[BLE] Starting reassembly: expect ' + this._rxExpected + ' bytes, first chunk has ' + this._rxBuf.length)
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
      console.log('[BLE] Continuing reassembly: got ' + combined.length + ' / ' + this._rxExpected + ' bytes')
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
