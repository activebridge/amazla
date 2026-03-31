import { BLEMaster } from "@silver-zepp/easy-ble"
import * as ble from "@zos/ble"

// Enable mock mode for testing without real Tesla (simulator)
const MOCK_MODE = false

// Tesla BLE UUIDs (from tesla-motors/vehicle-command)
const TESLA_SERVICE_UUID = "00000211-b2d1-43f0-9b88-960cebf8b91e"
const TESLA_WRITE_UUID = "00000212-b2d1-43f0-9b88-960cebf8b91e"
const TESLA_READ_UUID = "00000213-b2d1-43f0-9b88-960cebf8b91e"

// Default MTU payload size (MTU 23 - 3 ATT header = 20 bytes)
// This will be updated dynamically after MTU negotiation
let current_chunk_size = 20

// Tesla BLE device name pattern: S + SHA1(VIN)[:8].hex + C
const TESLA_NAME_PATTERN = /^S[a-f0-9]{16}C$/i

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

    this.services = {
      [TESLA_SERVICE_UUID]: {
        [TESLA_WRITE_UUID]: [],
        [TESLA_READ_UUID]: ["2902"],
      }
    }
  }

  _ensureBLE() {
    if (!this.ble) {
      this.ble = new BLEMaster()
    }
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
        console.log('[BLE] Cleanup error:', e)
      }
      this.ble = null
    }
    this.profile = null
    this.responseCallback = null
    this.mac = null
  }

  scan(callback, duration = 10000) {
    if (MOCK_MODE) {
      console.log('[BLE MOCK] Scanning...')
      setTimeout(() => {
        const mockDevice = { name: 'S1234567890abcdefC', mac: 'AA:BB:CC:DD:EE:FF', rssi: -50, type: 'tesla' }
        callback({ type: 'device', device: mockDevice })
        setTimeout(() => callback({ type: 'complete', devices: [mockDevice] }), 500)
      }, 1000)
      return true
    }

    const devices = []
    let completed = false
    const onComplete = () => {
      if (completed) return
      completed = true
      callback({ type: 'complete', devices })
    }

    const onDevice = (device) => {
      if (device.dev_name && TESLA_NAME_PATTERN.test(device.dev_name)) {
        const found = { name: device.dev_name, mac: device.dev_addr, rssi: device.rssi, type: 'tesla' }
        devices.push(found)
        callback({ type: 'found', device: found, devices })
      }
    }

    const started = this._ensureBLE().startScan(onDevice, {
      duration: duration,
      allow_duplicates: false,
      on_duration: onComplete
    })
    setTimeout(onComplete, duration + 500)
    return started
  }

  stopScan() {
    if (MOCK_MODE) return true
    return this._ensureBLE().stopScan()
  }

  connect(mac, callback) {
    if (MOCK_MODE) {
      console.log('[BLE MOCK] Connecting...')
      setTimeout(() => {
        this.connected = true
        this.mac = mac
        callback({ success: true, mac: mac })
      }, 500)
      return
    }

    let callbackCalled = false
    let setupStarted = false

    console.log('[BLE] Connecting to:', mac)

    const timeout = setTimeout(() => {
      if (!callbackCalled) {
        callbackCalled = true
        this.connected = false
        this._cleanup()
        callback({ success: false, error: 'Connection timeout' })
      }
    }, 30000)

    // Monitor MTU changes natively
    ble.mstOnMtuChange((res) => {
      console.log('[BLE] MTU negotiated:', res.mtu)
      current_chunk_size = res.mtu - 3
    })

    this._ensureBLE().connect(mac, (result) => {
      if (callbackCalled) {
        if (!result.connected) {
          this.connected = false
          if (this.onDisconnect) this.onDisconnect()
        }
        return
      }

      if (result.connected) {
        if (setupStarted) return
        setupStarted = true
        this.connected = true
        this.mac = mac

        console.log('[BLE] Connected, requesting MTU...')
        
        // 1. Hybrid MTU Request: Request 247 bytes immediately
        ble.mstRequestMtu({ mtu: 247 })

        // 2. Stability Delay: Allow car to process MTU and stabilize
        setTimeout(() => {
          if (!this.connected) return

          console.log('[BLE] Generating profile...')
          this.profile = this._ensureBLE().generateProfileObject(this.services, {
            [TESLA_WRITE_UUID]: { value: 0x04 }, // WRITE_WITHOUT_RESPONSE
            [TESLA_READ_UUID]:  { value: 0x20 }, // INDICATE
          })

          this._ensureBLE().startListener(this.profile, (response) => {
            if (callbackCalled) return
            clearTimeout(timeout)
            callbackCalled = true

            if (response.success) {
              this.charaValueHandler = (uuid, data, len) => {
                if (uuid.toUpperCase() === TESLA_READ_UUID.toUpperCase()) this._handleResponse(data, len)
              }
              this._ensureBLE().on.charaValueArrived(this.charaValueHandler)

              this.charaNotificationHandler = (uuid, data, len) => {
                if (uuid.toUpperCase() === TESLA_READ_UUID.toUpperCase()) this._handleResponse(data, len)
              }
              this._ensureBLE().on.charaNotification(this.charaNotificationHandler)

              this.writeCompleteHandler = (chara, desc, status) => {
                console.log('[BLE] descWriteComplete status:', status)
              }
              this._ensureBLE().on.descWriteComplete(this.writeCompleteHandler)

              console.log('[BLE] Enabling indications...')
              this._ensureBLE().write.descriptor(TESLA_READ_UUID, '2902', '0200')
              callback({ success: true, mac: mac })
            } else {
              this.connected = false
              this._cleanup()
              callback({ success: false, error: response.message || 'Listener failed' })
            }
          })
        }, 1000)
      } else {
        this.connected = false
        if (!setupStarted) {
          clearTimeout(timeout)
          callbackCalled = true
          this._cleanup()
          callback({ success: false, error: result.status || 'Connection failed' })
        }
      }
    })
  }

  disconnect() {
    this._cleanup()
    this.connected = false
    this.mac = null
    this.profile = null
    this.responseCallback = null
    this._rxBuf = null
    this._rxExpected = 0
  }

  // Throttled asynchronous sender
  async _sendThrottled(message) {
    const total = message.length
    let offset = 0
    
    while (offset < total) {
      const end = Math.min(offset + current_chunk_size, total)
      const chunk = message.slice(offset, end)
      
      console.log(`[BLE] Sending chunk ${offset}-${end}/${total}`)
      this._ensureBLE().write.characteristic(TESLA_WRITE_UUID, chunk.buffer, true)
      
      offset += current_chunk_size
      
      // If we have more chunks, wait 30ms to prevent car-side buffer overflow
      if (offset < total) {
        await new Promise(r => setTimeout(r, 30))
      }
    }
  }

  send(data, callback) {
    if (!this.connected) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    this.responseCallback = callback

    // Add 2-byte length prefix
    const length = data.length
    const message = new Uint8Array(2 + length)
    message[0] = (length >> 8) & 0xFF
    message[1] = length & 0xFF
    message.set(data, 2)

    this._sendThrottled(message).catch(e => {
      console.log('[BLE] Send error:', e)
    })
  }

  sendAndWaitForResponse(data, callback, timeout = 30000) {
    if (!this.connected) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    const responseTimeout = setTimeout(() => {
      this.responseCallback = null
      callback({ success: false, error: 'Response timeout' })
    }, timeout)

    this._rxBuf = null
    this._rxExpected = 0

    this.responseCallback = (result) => {
      clearTimeout(responseTimeout)
      callback(result)
    }

    const length = data.length
    const message = new Uint8Array(2 + length)
    message[0] = (length >> 8) & 0xFF
    message[1] = length & 0xFF
    message.set(data, 2)

    this._sendThrottled(message).catch(e => {
      console.log('[BLE] Send error:', e)
    })
  }

  _handleResponse(data, _len) {
    if (!this.responseCallback) return

    const chunk = new Uint8Array(data)
    const now = Date.now()
    const sig = chunk.length + '_' + (chunk[0] || 0) + '_' + (chunk[1] || 0)
    
    if (sig === this._lastResponseData && (now - this._lastResponseTime) < 200) return
    
    this._lastResponseData = sig
    this._lastResponseTime = now

    if (this._rxBuf === null) {
      if (chunk.length < 2) return
      this._rxExpected = (chunk[0] << 8) | chunk[1]
      this._rxBuf = chunk.slice(2)
    } else {
      const combined = new Uint8Array(this._rxBuf.length + chunk.length)
      combined.set(this._rxBuf)
      combined.set(chunk, this._rxBuf.length)
      this._rxBuf = combined
    }

    if (this._rxBuf.length >= this._rxExpected) {
      const payload = this._rxBuf.slice(0, this._rxExpected)
      this._rxBuf = null
      this._rxExpected = 0
      const cb = this.responseCallback
      this.responseCallback = null
      cb({ success: true, data: payload })
    }
  }

  isConnected() { return this.connected }
  getMAC() { return this.mac }
}

const teslaBLE = new TeslaBLE()
export default teslaBLE
export { TESLA_SERVICE_UUID, TESLA_WRITE_UUID, TESLA_READ_UUID }
