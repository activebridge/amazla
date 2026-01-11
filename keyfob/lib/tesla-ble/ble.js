import { BLEMaster } from "@silver-zepp/easy-ble"

// Enable mock mode for testing without real Tesla
const MOCK_MODE = false

// Tesla BLE UUIDs (from tesla-motors/vehicle-command)
const TESLA_SERVICE_UUID = "00000211-b2d1-43f0-9b88-960cebf8b91e"
const TESLA_WRITE_UUID = "00000212-b2d1-43f0-9b88-960cebf8b91e"
const TESLA_READ_UUID = "00000213-b2d1-43f0-9b88-960cebf8b91e"

// Tesla BLE device name pattern: S + SHA1(VIN)[:8].hex + C
const TESLA_NAME_PATTERN = /^S[a-f0-9]{16}C$/i

class TeslaBLE {
  constructor() {
    // Don't create BLEMaster here - create lazily
    this.ble = null
    this.connected = false
    this.mac = null
    this.profile = null
    this.responseCallback = null

    // Tesla service profile for easy-ble
    // Write characteristic: no descriptor needed
    // Read characteristic: needs 2902 (CCCD) for notifications
    this.services = {
      [TESLA_SERVICE_UUID]: {
        [TESLA_WRITE_UUID]: [],
        [TESLA_READ_UUID]: ["2902"],
      }
    }
  }

  // Lazy initialization of BLE
  _ensureBLE() {
    if (!this.ble) {
      this.ble = new BLEMaster()
    }
    return this.ble
  }

  // Scan for Tesla vehicles
  scan(callback, duration = 10000) {
    // Mock mode - return fake Tesla after short delay
    if (MOCK_MODE) {
      console.log('[BLE MOCK] Scanning...')
      setTimeout(() => {
        const mockDevice = {
          name: 'S1234567890abcdefC',
          mac: 'AA:BB:CC:DD:EE:FF',
          rssi: -50,
          type: 'tesla'
        }
        callback({ type: 'device', device: mockDevice })
        setTimeout(() => {
          callback({ type: 'complete', devices: [mockDevice] })
        }, 500)
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
      if (!device.dev_name) return

      // Check for Tesla BLE name pattern
      if (TESLA_NAME_PATTERN.test(device.dev_name)) {
        const found = {
          name: device.dev_name,
          mac: device.dev_addr,
          rssi: device.rssi,
          type: 'tesla'
        }
        devices.push(found)
        callback({ type: 'found', device: found, devices })
      }
    }

    const started = this._ensureBLE().startScan(onDevice, {
      duration: duration,
      allow_duplicates: false,
      on_duration: onComplete
    })

    // Fallback timeout in case on_duration doesn't fire
    setTimeout(onComplete, duration + 500)

    return started
  }

  // Stop scanning
  stopScan() {
    if (MOCK_MODE) return true
    return this._ensureBLE().stopScan()
  }

  // Connect to Tesla vehicle
  connect(mac, callback) {
    // Mock mode - simulate successful connection
    if (MOCK_MODE) {
      console.log('[BLE MOCK] Connecting to:', mac)
      setTimeout(() => {
        this.connected = true
        this.mac = mac
        console.log('[BLE MOCK] Connected!')
        callback({ success: true, mac: mac })
      }, 500)
      return
    }
    let callbackCalled = false

    console.log('[BLE] Connecting to:', mac)

    // Timeout for connection
    const timeout = setTimeout(() => {
      if (!callbackCalled) {
        callbackCalled = true
        this.connected = false
        console.log('[BLE] Connection timeout')
        callback({ success: false, error: 'Connection timeout' })
      }
    }, 30000)

    this._ensureBLE().connect(mac, (result) => {
      console.log('[BLE] Connect result:', JSON.stringify(result))
      if (callbackCalled) return

      if (result.connected) {
        this.connected = true
        this.mac = mac

        // Generate profile and start listener
        console.log('[BLE] Generating profile...')
        this.profile = this._ensureBLE().generateProfileObject(this.services)
        console.log('[BLE] Starting listener...')

        this._ensureBLE().startListener(this.profile, (response) => {
          console.log('[BLE] Listener response:', JSON.stringify(response))
          if (callbackCalled) return
          clearTimeout(timeout)
          callbackCalled = true

          if (response.success) {
            // Set up response handler
            this._ensureBLE().on.charaValueArrived((uuid, data, len) => {
              console.log('[BLE] Data arrived:', uuid, len)
              if (uuid.toUpperCase() === TESLA_READ_UUID.toUpperCase()) {
                this._handleResponse(data, len)
              }
            })

            // Enable notifications on read characteristic
            console.log('[BLE] Enabling notifications...')
            this._ensureBLE().write.enableCharaNotifications(TESLA_READ_UUID, true)

            console.log('[BLE] Connected successfully')
            callback({ success: true, mac: mac })
          } else {
            this.connected = false
            console.log('[BLE] Listener failed:', response.message)
            callback({ success: false, error: response.message || 'Listener failed' })
          }
        })
      } else {
        clearTimeout(timeout)
        callbackCalled = true
        this.connected = false
        console.log('[BLE] Connect failed:', result.status)
        callback({ success: false, error: result.status || 'Connection failed' })
      }
    })
  }

  // Disconnect from vehicle
  disconnect() {
    if (MOCK_MODE) {
      console.log('[BLE MOCK] Disconnected')
      this.connected = false
      this.mac = null
      return
    }
    if (this.ble) {
      this._ensureBLE().off.deregisterAll()
      this._ensureBLE().quit()
      this.ble = null
    }
    this.connected = false
    this.mac = null
    this.profile = null
  }

  // Send command to vehicle (with 2-byte length prefix)
  send(data, callback) {
    if (!this.connected) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    // Mock mode - simulate successful send with fake response
    if (MOCK_MODE) {
      console.log('[BLE MOCK] Sending', data.length, 'bytes')
      setTimeout(() => {
        // Simulate successful response
        console.log('[BLE MOCK] Command sent successfully')
        callback({ success: true, data: new Uint8Array([0x00]) })
      }, 300)
      return
    }

    // Store callback for response
    this.responseCallback = callback

    // Add 2-byte big-endian length prefix (Tesla protocol requirement)
    const length = data.length
    const message = new Uint8Array(2 + length)
    message[0] = (length >> 8) & 0xFF  // High byte
    message[1] = length & 0xFF          // Low byte
    message.set(data, 2)

    // Write to Tesla write characteristic
    this._ensureBLE().write.characteristic(TESLA_WRITE_UUID, message.buffer)

    // Set up write complete handler
    this._ensureBLE().on.charaWriteComplete((uuid, status) => {
      if (uuid.toUpperCase() === TESLA_WRITE_UUID.toUpperCase()) {
        if (status !== 0) {
          this.responseCallback({ success: false, error: `Write failed: ${status}` })
          this.responseCallback = null
        }
        // Otherwise wait for response via charaValueArrived
      }
    })
  }

  // Handle response from vehicle
  _handleResponse(data, len) {
    if (!this.responseCallback) return

    // Parse length prefix
    const view = new Uint8Array(data)
    if (view.length < 2) {
      this.responseCallback({ success: false, error: 'Response too short' })
      this.responseCallback = null
      return
    }

    const messageLength = (view[0] << 8) | view[1]
    const payload = view.slice(2, 2 + messageLength)

    this.responseCallback({ success: true, data: payload })
    this.responseCallback = null
  }

  // Get connection status
  isConnected() {
    return this.connected
  }

  // Get connected MAC address
  getMAC() {
    return this.mac
  }
}

// Singleton instance
const teslaBLE = new TeslaBLE()

export default teslaBLE
export { TESLA_SERVICE_UUID, TESLA_WRITE_UUID, TESLA_READ_UUID }
