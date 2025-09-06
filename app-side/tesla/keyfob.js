import BLEMaster from "@silver-zepp/easy-ble"
import { store } from './utils'
import teslaSession from './session.js'
import teslaKeyManager from './key-manager.js'

class TeslaKeyfob {
  constructor() {
    this.ble = new BLEMaster()
    this.isConnected = false
    this.targetMAC = null
    this.profile = null
    
    // Official Tesla BLE service UUIDs from tesla-motors/vehicle-command
    this.services = {
      "00000211-b2d1-43f0-9b88-960cebf8b91e": {  // Tesla Vehicle Service
        "00000212-b2d1-43f0-9b88-960cebf8b91e": ["2902"],  // Vehicle write characteristic (write with response)
        "00000213-b2d1-43f0-9b88-960cebf8b91e": [],        // Vehicle read characteristic  
      }
    }
    
    // Tesla UUIDs for easy reference
    this.TESLA_SERVICE_UUID = "00000211-b2d1-43f0-9b88-960cebf8b91e"
    this.TESLA_WRITE_CHAR = "00000212-b2d1-43f0-9b88-960cebf8b91e"
    this.TESLA_READ_CHAR = "00000213-b2d1-43f0-9b88-960cebf8b91e"
  }

  // Scan for Tesla vehicles
  async scanForTesla() {
    return new Promise((resolve, reject) => {
      const devices = []
      let scanTimeout
      
      this.ble.startScan((device) => {
        // Look for Tesla devices using official BLE advertisement pattern
        // Tesla BLE local name pattern: S + <VIN_SHA1_8bytes> + C
        // Example: S1a87a5a75f3df858C for VIN 5YJS0000000000000
        if (device.dev_name && device.dev_name.match(/^S[a-f0-9]{16}C$/i)) {
          devices.push({
            name: device.dev_name,
            mac: device.dev_addr,
            rssi: device.rssi,
            isTesla: true
          })
        }
        
        // Fallback: also check for devices with "Tesla" in name
        if (device.dev_name && device.dev_name.toLowerCase().includes('tesla')) {
          devices.push({
            name: device.dev_name,
            mac: device.dev_addr,
            rssi: device.rssi,
            isTesla: false
          })
        }
      })
      
      scanTimeout = setTimeout(() => {
        this.ble.stopScan()
        resolve(devices)
      }, 10000) // 10 second scan
    })
  }

  // Connect to Tesla vehicle
  async connect(macAddress) {
    return new Promise((resolve, reject) => {
      if (!macAddress) {
        reject(new Error('MAC address required'))
        return
      }

      this.ble.connect(macAddress, (result) => {
        if (result.connected) {
          this.isConnected = true
          this.targetMAC = macAddress
          store.setItem('tesla_ble_mac', macAddress)
          
          // Build BLE profile
          this.profile = this.ble.generateProfileObject(this.services)
          
          this.ble.startListener(this.profile, (response) => {
            if (response.success) {
              // Set up event handlers
              this.ble.on.charaValueArrived((uuid, data, len) => {
                console.log(`Tesla BLE Data received: ${uuid}, ${data}, ${len}`)
                this.handleResponse(uuid, data)
              })
              
              resolve({ success: true, message: 'Connected to Tesla' })
            } else {
              reject(new Error(`Profile setup failed: ${response.message}`))
            }
          })
        } else {
          reject(new Error(`Connection failed: ${result.status}`))
        }
      })
    })
  }

  // Disconnect from Tesla
  disconnect() {
    if (this.isConnected) {
      this.ble.disconnect()
      this.isConnected = false
      this.targetMAC = null
      store.removeItem('tesla_ble_mac')
    }
  }

  // Send authenticated lock command
  async lock() {
    if (!this.isConnected) {
      throw new Error('Not connected to Tesla')
    }

    if (!teslaKeyManager.hasKeys()) {
      throw new Error('No Tesla keys configured. Please add your private/public keys.')
    }

    try {
      // Create authenticated lock command
      const commandResult = await teslaSession.createLockCommand()
      
      if (!commandResult.success) {
        throw new Error(`Command creation failed: ${commandResult.error}`)
      }
      
      // Add length prefix as required by Tesla BLE protocol
      const messageWithLength = this.addLengthPrefix(commandResult.message)
      
      // Write to Tesla's official write characteristic
      const result = this.ble.write?.characteristic?.(this.TESLA_WRITE_CHAR, messageWithLength)
      
      console.log('Tesla BLE lock command sent')
      console.log('Session ID:', commandResult.sessionId)
      console.log('Counter:', commandResult.counter)
      
      // Update local state optimistically
      const vehicle = store.vehicle
      vehicle.locked = true
      store.vehicle = vehicle
      
      return { 
        success: true, 
        message: 'Vehicle locked via authenticated BLE',
        sessionId: commandResult.sessionId
      }
    } catch (error) {
      console.error('Tesla BLE lock failed:', error)
      throw new Error(`Tesla BLE lock failed: ${error.message}`)
    }
  }

  // Send authenticated unlock command
  async unlock() {
    if (!this.isConnected) {
      throw new Error('Not connected to Tesla')
    }

    if (!teslaKeyManager.hasKeys()) {
      throw new Error('No Tesla keys configured. Please add your private/public keys.')
    }

    try {
      // Create authenticated unlock command
      const commandResult = await teslaSession.createUnlockCommand()
      
      if (!commandResult.success) {
        throw new Error(`Command creation failed: ${commandResult.error}`)
      }
      
      // Add length prefix as required by Tesla BLE protocol
      const messageWithLength = this.addLengthPrefix(commandResult.message)
      
      // Write to Tesla's official write characteristic
      const result = this.ble.write?.characteristic?.(this.TESLA_WRITE_CHAR, messageWithLength)
      
      console.log('Tesla BLE unlock command sent')
      console.log('Session ID:', commandResult.sessionId)
      console.log('Counter:', commandResult.counter)
      
      // Update local state optimistically
      const vehicle = store.vehicle
      vehicle.locked = false
      store.vehicle = vehicle
      
      return { 
        success: true, 
        message: 'Vehicle unlocked via authenticated BLE',
        sessionId: commandResult.sessionId
      }
    } catch (error) {
      console.error('Tesla BLE unlock failed:', error)
      throw new Error(`Tesla BLE unlock failed: ${error.message}`)
    }
  }

  // Add 2-byte big-endian length prefix as required by Tesla BLE protocol
  addLengthPrefix(data) {
    const length = data.length
    const lengthBytes = [
      (length >> 8) & 0xFF,  // High byte
      length & 0xFF          // Low byte
    ]
    return [...lengthBytes, ...data]
  }

  // Import Tesla keys
  async importKeys(privateKeyPem, publicKeyPem) {
    try {
      const result = teslaKeyManager.importFromPem(privateKeyPem, publicKeyPem)
      
      if (result.success) {
        // Test the keys
        const testResult = await teslaKeyManager.testKeys()
        if (testResult.success) {
          console.log('Tesla keys imported and tested successfully')
          console.log('Key fingerprint:', testResult.fingerprint)
          
          // Reset session to use new keys
          teslaSession.resetSession()
          
          return {
            success: true,
            message: 'Keys imported successfully',
            fingerprint: testResult.fingerprint
          }
        } else {
          teslaKeyManager.clearKeys()
          throw new Error(`Key test failed: ${testResult.error}`)
        }
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Key import failed:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // Set Tesla keys from hex format
  setKeysHex(privateKeyHex, publicKeyHex) {
    try {
      const result = teslaKeyManager.setKeys(privateKeyHex, publicKeyHex)
      
      if (result.success) {
        // Reset session to use new keys
        teslaSession.resetSession()
        console.log('Tesla keys set successfully')
      }
      
      return result
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  // Handle responses from Tesla
  handleResponse(uuid, data) {
    try {
      switch (uuid) {
        case this.TESLA_READ_CHAR:
          // Handle Tesla vehicle read characteristic responses
          console.log('Tesla BLE response received:', data)
          
          // Parse message length prefix (first 2 bytes)
          if (data.length >= 2) {
            const messageLength = (data[0] << 8) | data[1]
            const message = data.slice(2, 2 + messageLength)
            
            console.log(`Tesla message length: ${messageLength}, data:`, message)
            
            // Handle response with session manager
            teslaSession.handleResponse(message).then(result => {
              if (result.success) {
                console.log('Tesla response processed successfully')
                this.updateVehicleStatus(result.response)
              } else {
                console.error('Tesla response processing failed:', result.error)
              }
            }).catch(error => {
              console.error('Tesla response error:', error)
            })
          }
          break
          
        case this.TESLA_WRITE_CHAR:
          // Handle write confirmations if any
          console.log('Tesla BLE write confirmation:', data)
          break
          
        default:
          console.log(`Unknown Tesla BLE response from ${uuid}:`, data)
      }
    } catch (error) {
      console.error('Error handling Tesla BLE response:', error)
    }
  }

  // Update vehicle status from BLE data
  updateVehicleStatus(data) {
    try {
      const vehicle = store.vehicle
      
      // Parse status data (adjust based on actual Tesla protocol)
      if (data.length >= 2) {
        vehicle.locked = data[0] === 0x01
        // Add more status parsing as needed
      }
      
      store.vehicle = vehicle
    } catch (error) {
      console.error('Error updating vehicle status:', error)
    }
  }

  // Auto-connect to saved Tesla
  async autoConnect() {
    const savedMAC = store.getItem('tesla_ble_mac')
    if (savedMAC) {
      try {
        await this.connect(savedMAC)
        return true
      } catch (error) {
        console.error('Auto-connect failed:', error)
        return false
      }
    }
    return false
  }

  // Get connection status
  getStatus() {
    const keyStatus = teslaKeyManager.getKeys()
    const sessionStatus = teslaSession.getSessionStatus()
    
    return {
      connected: this.isConnected,
      mac: this.targetMAC,
      hasProfile: !!this.profile,
      hasKeys: keyStatus.hasKeys,
      keyFingerprint: teslaKeyManager.getKeyFingerprint(),
      sessionEstablished: sessionStatus.established,
      sessionId: sessionStatus.sessionId,
      sessionCounter: sessionStatus.counter
    }
  }

  // Clear Tesla keys
  clearKeys() {
    teslaSession.resetSession()
    return teslaKeyManager.clearKeys()
  }

  // Get key information
  getKeyInfo() {
    const keys = teslaKeyManager.getKeys()
    return {
      hasKeys: keys.hasKeys,
      fingerprint: teslaKeyManager.getKeyFingerprint()
    }
  }
}

// Create singleton instance
const teslaKeyfob = new TeslaKeyfob()

export default teslaKeyfob