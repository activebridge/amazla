// Tesla BLE API for ZeppOS
// Main entry point for Tesla vehicle control via Bluetooth

import teslaBLE from './ble.js'

// Lazy-loaded modules (contain heavy crypto)
let _teslaSession = null
let _teslaKeyManager = null

const getSession = () => {
  if (!_teslaSession) {
    _teslaSession = require('./session.js').default
  }
  return _teslaSession
}

const getKeyManager = () => {
  if (!_teslaKeyManager) {
    _teslaKeyManager = require('./keys.js').default
  }
  return _teslaKeyManager
}

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
      savedMAC: this.savedMAC
    }
  }

  // Load crypto modules and keys (call before commands)
  loadCrypto() {
    if (!this._storage) return { success: false, error: 'Not initialized' }

    // Initialize key manager
    getKeyManager().init(this._storage)

    // Load private key into session
    if (getKeyManager().hasKeys()) {
      getSession().setPrivateKey(getKeyManager().getPrivateKeyHex())
    }

    return {
      success: true,
      hasKeys: getKeyManager().hasKeys()
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
    if (_teslaSession) _teslaSession.reset()
    teslaBLE.disconnect()
  }

  // Check connection status
  isConnected() {
    return teslaBLE.isConnected()
  }

  // Set private key (from secrets) - loads crypto
  setPrivateKey(privateKeyHex, publicKeyHex) {
    const result = getKeyManager().setKeysHex(privateKeyHex, publicKeyHex)
    if (result.success) {
      getSession().setPrivateKey(privateKeyHex, publicKeyHex)
    }
    return result
  }

  // Import key from PEM - loads crypto
  importKeyPEM(pemString) {
    const result = getKeyManager().importFromPEM(pemString)
    if (result.success) {
      getSession().setPrivateKey(getKeyManager().getPrivateKeyHex())
    }
    return result
  }

  // Check if keys are configured
  hasKeys() {
    return _teslaKeyManager ? getKeyManager().hasKeys() : false
  }

  // Get key fingerprint
  getKeyFingerprint() {
    return _teslaKeyManager ? getKeyManager().getFingerprint() : null
  }

  // Lock vehicle - loads crypto on first use
  lock(callback) {
    if (!this.isConnected()) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    // Load crypto if needed
    if (!_teslaKeyManager) {
      this.loadCrypto()
    }

    if (!this.hasKeys()) {
      callback({ success: false, error: 'No keys configured' })
      return
    }

    getSession().lock(callback)
  }

  // Unlock vehicle
  unlock(callback) {
    if (!this.isConnected()) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    if (!_teslaKeyManager) {
      this.loadCrypto()
    }

    if (!this.hasKeys()) {
      callback({ success: false, error: 'No keys configured' })
      return
    }

    getSession().unlock(callback)
  }

  // Open trunk
  openTrunk(callback) {
    if (!this.isConnected()) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    if (!_teslaKeyManager) {
      this.loadCrypto()
    }

    if (!this.hasKeys()) {
      callback({ success: false, error: 'No keys configured' })
      return
    }

    getSession().openTrunk(callback)
  }

  // Open frunk
  openFrunk(callback) {
    if (!this.isConnected()) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    if (!_teslaKeyManager) {
      this.loadCrypto()
    }

    if (!this.hasKeys()) {
      callback({ success: false, error: 'No keys configured' })
      return
    }

    getSession().openFrunk(callback)
  }

  // Pair key with vehicle
  pair(callback) {
    if (!this.isConnected()) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    if (!_teslaKeyManager) {
      this.loadCrypto()
    }

    if (!this.hasKeys()) {
      callback({ success: false, error: 'No keys configured' })
      return
    }

    getSession().pair(callback)
  }

  // Get full status
  getStatus() {
    return {
      initialized: this.initialized,
      connected: teslaBLE.isConnected(),
      mac: teslaBLE.getMAC(),
      savedMAC: this.savedMAC,
      cryptoLoaded: !!_teslaKeyManager
    }
  }

  // Clear saved data
  clear(settingsStorage) {
    if (_teslaKeyManager) getKeyManager().clear()
    if (_teslaSession) getSession().reset()
    teslaBLE.disconnect()

    if (settingsStorage) {
      settingsStorage.removeItem('tesla_ble_mac')
    }

    this.savedMAC = null
  }
}

// Export singleton
const teslaBleApi = new TeslaBleApi()

export default teslaBleApi
export { teslaBLE }
