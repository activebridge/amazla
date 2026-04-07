import { BLEMaster } from "@silver-zepp/easy-ble"
import * as hmBle from "@zos/ble"
const TESLA_SERVICE_UUID = "00000211-b2d1-43f0-9b88-960cebf8b91e"
const TESLA_WRITE_UUID = "00000212-b2d1-43f0-9b88-960cebf8b91e"
const TESLA_READ_UUID = "00000213-b2d1-43f0-9b88-960cebf8b91e"
const BLE_CHUNK_SIZE = 20
const TESLA_NAME_PATTERN = /^S[a-f0-9]{16}C$/i
const CONNECTION_CONFIG = {
  timeouts: [5000, 8000, 10000],
  maxAttempts: 3,
  stackStabilizeWait: 100,  // Reduced from 2000ms - Tesla SDK has no delay
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
      console.log('[BLE] Connected successfully, settling...')
      
      // Settle immediately - connection is ready for send() operations
      settle({ success: true, mac })
      
      // Call startListener in the background (non-blocking)
      // This builds the GATT profile so we can write descriptors/characteristics
      // Start immediately (synchronously) before any disconnect callbacks can fire
      console.log('[BLE] Setting up GATT profile in background...')
      this._ensureBLE().startListener(this.services, (response) => {
        if (response && response.success) {
          console.log('[BLE] GATT profile setup complete, enabling notifications...')
          this.gattReady = true  // Mark GATT as ready for sending
          
          // ONLY write descriptor AFTER profile is ready
          try {
            console.log('[BLE] Enabling indications (CCCD)...')
            this._ensureBLE().write.descriptor(TESLA_READ_UUID, '2902', '0200')
          } catch (e) {
            console.log('[BLE] Failed to enable CCCD:', e.message || e)
          }
          
          // Register callbacks for unsolicited notifications
          this.charaValueHandler = (uuid, data, len) => {
            console.log('[BLE] charaValueArrived:', uuid, len)
            if (uuid.toUpperCase() === TESLA_READ_UUID.toUpperCase()) this._handleResponse(data, len)
          }
          try {
            this._ensureBLE().on.charaValueArrived(this.charaValueHandler)
          } catch (e) {
            console.log('[BLE] Failed to register charaValueArrived:', e.message || e)
          }
          
          this.charaNotificationHandler = (uuid, data, len) => {
            console.log('[BLE] charaNotification:', uuid, len)
            if (uuid.toUpperCase() === TESLA_READ_UUID.toUpperCase()) this._handleResponse(data, len)
          }
          try {
            this._ensureBLE().on.charaNotification(this.charaNotificationHandler)
          } catch (e) {
            console.log('[BLE] Failed to register charaNotification:', e.message || e)
          }
        } else {
          console.log('[BLE] GATT profile setup failed:', response && response.message)
        }
      })
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
    
    // If GATT isn't ready yet, wait for it before sending
    if (!this.gattReady) {
      console.log('[BLE] Waiting for GATT profile to be ready before send()...')
      const gattCheckInterval = setInterval(() => {
        if (this.gattReady) {
          clearInterval(gattCheckInterval)
          console.log('[BLE] GATT profile ready, proceeding with send()')
          this.responseCallback = wrappedCallback
          this._sendMessage(_frame(data))
        }
      }, 10)
      // Timeout if GATT takes too long
      setTimeout(() => {
        clearInterval(gattCheckInterval)
        if (!this.gattReady) {
          console.log('[BLE] GATT profile setup took too long (5s), proceeding anyway')
          this.responseCallback = wrappedCallback
          this._sendMessage(_frame(data))
        }
      }, 5000)
      return
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
    
    // If GATT isn't ready yet, wait for it before sending
    if (!this.gattReady) {
      console.log('[BLE] Waiting for GATT profile to be ready...')
      const gattCheckInterval = setInterval(() => {
        if (this.gattReady) {
          clearInterval(gattCheckInterval)
          console.log('[BLE] GATT profile ready, proceeding with send')
          this._doSendAndWait(data, callback, timeout)
        }
      }, 10)
      // Timeout if GATT takes too long
      setTimeout(() => {
        clearInterval(gattCheckInterval)
        if (!this.gattReady) {
          console.log('[BLE] GATT profile setup took too long (5s), proceeding anyway')
          this._doSendAndWait(data, callback, timeout)
        }
      }, 5000)
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
