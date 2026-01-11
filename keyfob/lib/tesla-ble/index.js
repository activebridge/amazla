// Tesla BLE API for ZeppOS
// Main entry point for Tesla vehicle control via Bluetooth
// NOTE: Crypto operations delegated to phone app-side to save memory

import teslaBLE from './ble.js'

let _privateKeyHex = null
let _publicKeyHex = null

class TeslaBleApi {
  constructor() {
    this.initialized = false
    this.savedMAC = null
    this._storage = null
  }

  // Initialize with settings storage (lightweight - no crypto loaded)
  init(settingsStorage) {
    this._storage = settingsStorage

    // Load saved MAC address
    this.savedMAC = settingsStorage.getItem('tesla_ble_mac')

    this.initialized = true

    return {
      success: true,
      savedMAC: this.savedMAC,
      hasKeys: !!_privateKeyHex
    }
  }

  // Scan for Tesla vehicles
  scan(callback, duration = 10000) {
    return teslaBLE.scan(callback, duration)
  }

  // Stop scanning
  stopScan() {
    return teslaBLE.stopScan()
  }

  // Connect to Tesla vehicle
  connect(mac, callback, settingsStorage) {
    teslaBLE.connect(mac, (result) => {
      if (result.success && settingsStorage) {
        // Save MAC for auto-connect
        settingsStorage.setItem('tesla_ble_mac', mac)
        this.savedMAC = mac
      }
      callback(result)
    })
  }

  // Auto-connect to saved vehicle
  autoConnect(callback) {
    if (!this.savedMAC) {
      callback({ success: false, error: 'No saved vehicle' })
      return
    }

    teslaBLE.connect(this.savedMAC, callback)
  }

  // Disconnect
  disconnect() {
    teslaBLE.disconnect()
  }

  // Check connection status
  isConnected() {
    return teslaBLE.isConnected()
  }

  // Set private key (from secrets) - caches for later use
  setPrivateKey(privateKeyHex, publicKeyHex) {
    _privateKeyHex = privateKeyHex
    _publicKeyHex = publicKeyHex
    return { success: true }
  }

  // Check if keys are configured
  hasKeys() {
    return !!_privateKeyHex
  }

  // Get public key hex
  getPublicKeyHex() {
    return _publicKeyHex
  }

  // Get private key hex
  getPrivateKeyHex() {
    return _privateKeyHex
  }

  // Lock vehicle - TODO: delegate to phone app-side
  lock(callback) {
    callback({ success: false, error: 'Use phone app for commands' })
  }

  // Unlock vehicle - TODO: delegate to phone app-side
  unlock(callback) {
    callback({ success: false, error: 'Use phone app for commands' })
  }

  // Open trunk - TODO: delegate to phone app-side
  openTrunk(callback) {
    callback({ success: false, error: 'Use phone app for commands' })
  }

  // Open frunk - TODO: delegate to phone app-side
  openFrunk(callback) {
    callback({ success: false, error: 'Use phone app for commands' })
  }

  // Pair key with vehicle - TODO: delegate to phone app-side
  pair(callback) {
    callback({ success: false, error: 'Use phone app for pairing' })
  }

  // Get full status
  getStatus() {
    return {
      initialized: this.initialized,
      connected: teslaBLE.isConnected(),
      mac: teslaBLE.getMAC(),
      savedMAC: this.savedMAC,
      hasKeys: this.hasKeys()
    }
  }

  // Clear saved data
  clear(settingsStorage) {
    teslaBLE.disconnect()

    if (settingsStorage) {
      settingsStorage.removeItem('tesla_ble_mac')
    }

    _privateKeyHex = null
    _publicKeyHex = null
    this.savedMAC = null
  }
}

// Export singleton
const teslaBleApi = new TeslaBleApi()

export default teslaBleApi
export { teslaBLE }
