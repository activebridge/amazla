
import teslaBLE, { CONNECTION_CONFIG } from './ble-native.js'
import store from '../store.js'
let _privateKeyHex = null
let _publicKeyHex = null
class TeslaBleApi {
  constructor() {
    this.initialized = false
    this.savedMAC = null
  }
  init() {
    this.savedMAC = store.vehicleMac
    this.initialized = true
    return {
      success: true,
      savedMAC: this.savedMAC,
      hasKeys: !!_privateKeyHex
    }
  }
  scan(callback, duration = 10000) {
    return teslaBLE.scan(callback, duration)
  }
  stopScan() {
    return teslaBLE.stopScan()
  }
  connect(mac, callback) {
    teslaBLE.connect(mac, (result) => {
      if (result.success) {
        store.vehicleMac = mac
        this.savedMAC = mac
      }
      callback(result)
    })
  }

  autoConnect(callback) {
    if (!this.savedMAC) {
      callback({ success: false, error: 'No saved vehicle' })
      return
    }
    teslaBLE.connect(this.savedMAC, callback)
  }
  disconnect() {
    teslaBLE.disconnect()
  }
  set onDisconnect(fn) {
    teslaBLE.onDisconnect = fn
  }
  isConnected() {
    return teslaBLE.isConnected()
  }
  setPrivateKey(privateKeyHex, publicKeyHex) {
    _privateKeyHex = privateKeyHex
    _publicKeyHex = publicKeyHex
    return { success: true }
  }
  hasKeys() {
    return !!_privateKeyHex
  }
  getPublicKeyHex() {
    return _publicKeyHex
  }
  getPrivateKeyHex() {
    return _privateKeyHex
  }
  lock(callback) {
    callback({ success: false, error: 'Use phone app for commands' })
  }
  unlock(callback) {
    callback({ success: false, error: 'Use phone app for commands' })
  }
  openTrunk(callback) {
    callback({ success: false, error: 'Use phone app for commands' })
  }
  openFrunk(callback) {
    callback({ success: false, error: 'Use phone app for commands' })
  }
  pair(callback) {
    callback({ success: false, error: 'Use phone app for pairing' })
  }
  getStatus() {
    return {
      initialized: this.initialized,
      connected: teslaBLE.isConnected(),
      mac: teslaBLE.getMAC(),
      savedMAC: this.savedMAC,
      hasKeys: this.hasKeys()
    }
  }
  clear() {
    teslaBLE.disconnect()
    // Clear canonical store
    store.removeItem('vehicleMac')
    if (typeof store.removeBinary === 'function') {
      store.removeBinary('vehicle_ec_public_key')
      store.removeBinary('vehicle_doublings_table')
      store.removeBinary('key_pool')
    }
    _privateKeyHex = null
    _publicKeyHex = null
    this.savedMAC = null
  }
  reset() {
    teslaBLE.reset()
  }
}
const teslaBleApi = new TeslaBleApi()
export default teslaBleApi
export { teslaBLE, CONNECTION_CONFIG }
