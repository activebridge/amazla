import { BLEMaster } from "@silver-zepp/easy-ble"
import * as hmBle from "@zos/ble"

// Tesla BLE UUIDs (from tesla-motors/vehicle-command)
const TESLA_SERVICE_UUID = "00000211-b2d1-43f0-9b88-960cebf8b91e"
const TESLA_WRITE_UUID = "00000212-b2d1-43f0-9b88-960cebf8b91e"
const TESLA_READ_UUID = "00000213-b2d1-43f0-9b88-960cebf8b91e"

// BLE ATT payload size (MTU 23 - 3 ATT header = 20 bytes)
// Tesla's vehicle-command sends in 20-byte chunks with Write Without Response
const BLE_CHUNK_SIZE = 20

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
    this.onDisconnect = null
    this.writeCompleteHandler = null
    this.charaValueHandler = null
    this.charaNotificationHandler = null
    this._lastResponseData = null  // dedup: ignore duplicate data within 200ms
    this._lastResponseTime = 0
    this._rxBuf = null             // reassembly buffer for chunked responses
    this._rxExpected = 0
    this._rxLastChunkTime = 0      // timestamp of last received chunk (for stale buffer reset)
    this._mtu = 20                 // negotiated MTU payload size (default 20)

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

  // Clean up BLE state without full disconnect (for failed connections)
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
    this.mac = null
    this._mtu = 20
  }

  // Scan for Tesla vehicles
  scan(callback, duration = 10000) {
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
    return this._ensureBLE().stopScan()
  }

  // Connect to Tesla vehicle
  connect(mac, callback) {
    let callbackCalled = false
    let setupStarted = false

    console.log('[BLE] Connecting to:', mac)

    // Timeout for connection — 15s is enough for Tesla; 30s just keeps the user waiting
    const timeout = setTimeout(() => {
      if (!callbackCalled) {
        callbackCalled = true
        this.connected = false
        console.log('[BLE] Connection timeout')
        this._cleanup()
        callback({ success: false, error: 'Connection timeout' })
      }
    }, 15000)

    this._ensureBLE().connect(mac, (result) => {
      console.log('[BLE] Connect result:', JSON.stringify(result))
      if (callbackCalled) {
        // Post-connection callback = disconnect event from EasyBle
        if (!result.connected) {
          this.connected = false
          if (this.onDisconnect) this.onDisconnect()
        }
        return
      }

      if (result.connected) {
        // Guard against duplicate connected callbacks
        if (setupStarted) {
          console.log('[BLE] Ignoring duplicate connected callback')
          return
        }
        setupStarted = true

        this.connected = true
        this.mac = mac

        // Add delay for BLE stack to stabilize after connection
        // Without this, generateProfileObject/startListener can fail with BX_CORE_FAIL
        console.log('[BLE] Connected, waiting for BLE stack to stabilize...')
        setTimeout(() => {
          if (!this.connected) {
            // Connection was lost during delay
            if (!callbackCalled) {
              callbackCalled = true
              clearTimeout(timeout)
              this._cleanup()
              callback({ success: false, error: 'Connection lost during setup' })
            }
            return
          }

          // Generate profile and start listener.
          // Write char: 0x04 = WRITE_WITHOUT_RESPONSE (Tesla TX char only supports WOR)
          // Read char:  0x20 = INDICATE (CCCD=0x0002, Tesla sends indications not notifications)
          console.log('[BLE] Generating profile...')
          this.profile = this._ensureBLE().generateProfileObject(this.services, {
            [TESLA_WRITE_UUID]: { value: 0x04 },  // WRITE_WITHOUT_RESPONSE
            [TESLA_READ_UUID]:  { value: 0x20 },  // INDICATE
          })
          console.log('[BLE] Starting listener...')

          this._ensureBLE().startListener(this.profile, (response) => {
          console.log('[BLE] Listener response:', JSON.stringify(response))
          if (callbackCalled) return

          if (response.success) {
            // Set up response handler for both NOTIFY and INDICATE
            // Tesla uses INDICATE (CCCD=0x0002), data arrives via charaNotification
            // Also listen on charaValueArrived as fallback
            this.charaValueHandler = (uuid, data, len) => {
              console.log('[BLE] charaValueArrived:', uuid, len)
              if (uuid.toUpperCase() === TESLA_READ_UUID.toUpperCase()) {
                this._handleResponse(data, len)
              }
            }
            this._ensureBLE().on.charaValueArrived(this.charaValueHandler)

            this.charaNotificationHandler = (uuid, data, len) => {
              console.log('[BLE] charaNotification:', uuid, len)
              if (uuid.toUpperCase() === TESLA_READ_UUID.toUpperCase()) {
                this._handleResponse(data, len)
              }
            }
            this._ensureBLE().on.charaNotification(this.charaNotificationHandler)

            // Gate the connected callback on descWriteComplete so CCCD is confirmed
            // before the caller sends the pairing message — mirrors Go SDK's Subscribe
            // blocking until the CCCD write is acknowledged.
            this.writeCompleteHandler = (chara, desc, status) => {
              console.log('[BLE] descWriteComplete:', chara, desc, 'status:', status)
              if (!callbackCalled) {
                callbackCalled = true
                clearTimeout(timeout)
                // Negotiate MTU after CCCD — mirrors Go SDK ExchangeMTU() order:
                // Subscribe first, then ExchangeMTU.
                console.log('[BLE] Requesting MTU 247...')
                try {
                  hmBle.mstSetMTU(247, (mtuResult) => {
                    const negotiated = (mtuResult && mtuResult.mtu) ? mtuResult.mtu - 3 : 20
                    this._mtu = Math.max(20, negotiated)
                    console.log('[BLE] MTU negotiated:', mtuResult && mtuResult.mtu, '→ payload', this._mtu)
                  })
                } catch (e) {
                  console.log('[BLE] mstSetMTU not available:', e.message || e)
                }
                console.log('[BLE] CCCD confirmed, ready')
                callback({ success: true, mac: mac })
              }
            }
            this._ensureBLE().on.descWriteComplete(this.writeCompleteHandler)

            // Write CCCD with INDICATE value (0x0002, little-endian "0200")
            // enableCharaNotifications writes "0100" (NOTIFY=0x0001) which Tesla ignores
            console.log('[BLE] Enabling indications (CCCD=0x0002)...')
            this._ensureBLE().write.descriptor(TESLA_READ_UUID, '2902', '0200')

            // Safety fallback: if descWriteComplete never fires, proceed after 3s
            setTimeout(() => {
              if (!callbackCalled) {
                callbackCalled = true
                clearTimeout(timeout)
                console.log('[BLE] CCCD timeout fallback, continuing')
                callback({ success: true, mac: mac })
              }
            }, 3000)
          } else {
            callbackCalled = true
            clearTimeout(timeout)
            this.connected = false
            console.log('[BLE] Listener failed:', response.message)
            this._cleanup()
            callback({ success: false, error: response.message || 'Listener failed' })
          }
        })
        }, 2000) // Delay for BLE stack stabilization
      } else {
        // Mark as disconnected so the setTimeout check catches it
        this.connected = false
        console.log('[BLE] Connect failed:', result.status)

        // If setup already started, let the setTimeout handle cleanup and callback
        if (setupStarted) {
          console.log('[BLE] Setup in progress, will be handled by stabilization check')
          return
        }

        clearTimeout(timeout)
        callbackCalled = true

        // Clean up BLE instance to prevent stale state on retry
        this._cleanup()

        callback({ success: false, error: result.status || 'Connection failed' })
      }
    })
  }

  // Disconnect from vehicle
  disconnect() {
    // Clean up handlers to prevent memory leaks
    if (this.ble) {
      if (this.writeCompleteHandler) {
        this._ensureBLE().off.descWriteComplete()
        this.writeCompleteHandler = null
      }
      if (this.charaValueHandler) {
        this._ensureBLE().off.charaValueArrived(this.charaValueHandler)
        this.charaValueHandler = null
      }
      if (this.charaNotificationHandler) {
        this._ensureBLE().off.charaNotification(this.charaNotificationHandler)
        this.charaNotificationHandler = null
      }
      this._ensureBLE().off.deregisterAll()
      this._ensureBLE().quit()
      this.ble = null
    }

    this.connected = false
    this.mac = null
    this.profile = null
    this.responseCallback = null
    this._rxBuf = null
    this._rxExpected = 0
    this._mtu = 20
  }

  // Send command to vehicle (with 2-byte length prefix)
  send(data, callback) {
    if (!this.connected) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    this.responseCallback = callback

    // Add 2-byte big-endian length prefix (Tesla protocol requirement)
    const length = data.length
    const message = new Uint8Array(2 + length)
    message[0] = (length >> 8) & 0xFF
    message[1] = length & 0xFF
    message.set(data, 2)

    this._sendMessage(message)
  }

  // Register a callback to receive the next BLE indication without sending anything.
  // Used after an initial sendAndWaitForResponse returns 'wait' (e.g. wlInfo=14 = tap NFC),
  // to wait for the car's second notification once the user taps the NFC card.
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

  // Send command and wait for Tesla's response via BLE notification
  // Use this for operations that expect a response (pairing, commands)
  sendAndWaitForResponse(data, callback, timeout = 30000) {
    if (!this.connected) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    // Set up timeout for response
    const responseTimeout = setTimeout(() => {
      console.log('[BLE] Response timeout')
      this.responseCallback = null
      callback({ success: false, error: 'Response timeout' })
    }, timeout)

    // Reset reassembly buffer in case a prior operation left partial data
    this._rxBuf = null
    this._rxExpected = 0

    // Store callback that will be triggered when data arrives via BLE indication
    this.responseCallback = (result) => {
      clearTimeout(responseTimeout)
      callback(result)
    }

    // Add 2-byte big-endian length prefix
    const length = data.length
    const message = new Uint8Array(2 + length)
    message[0] = (length >> 8) & 0xFF
    message[1] = length & 0xFF
    message.set(data, 2)

    this._sendMessage(message)
    // Tesla will reassemble chunks and respond via BLE indication → _handleResponse
  }

  // Send a framed message — single write if MTU fits, otherwise 20ms-serialized chunks.
  // Mirrors Tesla Go SDK: WriteCharacteristic blocks per packet so chunks are naturally
  // paced to one per BLE connection interval. Firing all chunks at once floods the OS
  // queue and causes silent packet loss.
  _sendMessage(message) {
    if (message.length <= this._mtu) {
      // Fits in one write — matches Go SDK behaviour after MTU negotiation
      console.log('[BLE] TX', message.length, 'bytes (single write)')
      this._ensureBLE().write.characteristic(TESLA_WRITE_UUID, message.buffer, true)
    } else {
      // Serialized chunks: one chunk per setTimeout tick (20ms) so the BLE radio
      // has time to transmit each packet before the next arrives in the OS queue.
      const total = Math.ceil(message.length / BLE_CHUNK_SIZE)
      console.log('[BLE] TX', message.length, 'bytes in', total, 'chunks (20ms paced)')
      this._sendChunk(message, 0)
    }
  }

  _sendChunk(message, offset) {
    const end = Math.min(offset + BLE_CHUNK_SIZE, message.length)
    const chunk = message.slice(offset, end)
    this._ensureBLE().write.characteristic(TESLA_WRITE_UUID, chunk.buffer, true)
    if (end < message.length) {
      setTimeout(() => this._sendChunk(message, end), 20)
    }
  }

  // Handle response from vehicle — reassembles chunked BLE indications.
  // Tesla sends responses framed with a 2-byte big-endian length prefix,
  // then the payload split into MTU-sized chunks (same framing as TX).
  _handleResponse(data, _len) {
    if (!this.responseCallback) return

    const chunk = new Uint8Array(data)

    // Dedup: charaValueArrived and charaNotification both fire for the same packet.
    // Only check on the first chunk of a new message (_rxBuf === null) — mid-reassembly
    // chunks cannot be duplicates and must never be dropped.
    if (this._rxBuf === null) {
      const now = Date.now()
      const sig = chunk.length + '_' + (chunk[0] || 0) + '_' + (chunk[1] || 0)
      if (sig === this._lastResponseData && (now - this._lastResponseTime) < 200) {
        console.log('[BLE] Duplicate first chunk ignored')
        return
      }
      this._lastResponseData = sig
      this._lastResponseTime = now
    }

    if (this._rxBuf === null) {
      // First chunk: read 2-byte length prefix
      // Mirror Go SDK rxTimeout: if >1s has passed since the last chunk of a prior
      // message, the previous reassembly was stale — the buffer was already null here,
      // so nothing to reset, but record the time for mid-message stale detection.
      if (chunk.length < 2) {
        const cb = this.responseCallback
        this.responseCallback = null
        cb({ success: false, error: 'Response too short' })
        return
      }
      this._rxExpected = (chunk[0] << 8) | chunk[1]
      this._rxBuf = chunk.slice(2)
      this._rxLastChunkTime = Date.now()
    } else {
      // Subsequent chunk: reset stale buffer if >1s since last chunk (mirrors Go SDK rxTimeout)
      if (Date.now() - this._rxLastChunkTime > 1000) {
        console.log('[BLE] Stale reassembly buffer reset')
        this._rxBuf = null
        this._rxExpected = 0
        return
      }
      this._rxLastChunkTime = Date.now()
      // Append to reassembly buffer
      const combined = new Uint8Array(this._rxBuf.length + chunk.length)
      combined.set(this._rxBuf)
      combined.set(chunk, this._rxBuf.length)
      this._rxBuf = combined
    }

    console.log('[BLE] RX buf', this._rxBuf.length, '/', this._rxExpected, 'bytes')

    if (this._rxBuf.length < this._rxExpected) {
      return  // still waiting for more chunks
    }

    // Complete message — deliver and reset buffer
    const payload = this._rxBuf.slice(0, this._rxExpected)
    this._rxBuf = null
    this._rxExpected = 0

    // Capture and clear BEFORE calling so callback can set a new responseCallback
    // (e.g. _waitForPairingConfirmation sets one inside the 'wait' handler)
    const cb = this.responseCallback
    this.responseCallback = null

    console.log('[BLE] Got complete response:', payload.length, 'bytes')
    cb({ success: true, data: payload })
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
