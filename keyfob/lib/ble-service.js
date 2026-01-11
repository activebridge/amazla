// BLE Service for Tesla control
// Wraps tesla-ble library for use in watch pages

import teslaBleApi from './tesla-ble/index.js'
import { TESLA_PRIVATE_KEY, TESLA_PUBLIC_KEY } from '../../secrets.js'
import { LocalStorage } from '@zos/storage'

class BleService {
  constructor() {
    this.status = 'disconnected'
    this.listeners = []
    this.storage = null
    this.initialized = false
  }

  // Initialize the BLE service (lightweight - no crypto)
  init() {
    if (this.initialized) {
      return { success: true }
    }

    try {
      // Create storage lazily
      this.storage = new LocalStorage()

      const result = teslaBleApi.init(this.storage)

      this.initialized = true
      return result
    } catch (e) {
      console.log('BLE Service init error:', e)
      return { success: false, error: e.message }
    }
  }

  // Load crypto and set private key (call before commands)
  loadCrypto() {
    if (TESLA_PRIVATE_KEY && TESLA_PRIVATE_KEY.length === 64) {
      teslaBleApi.setPrivateKey(TESLA_PRIVATE_KEY, TESLA_PUBLIC_KEY)
    }
    return teslaBleApi.loadCrypto()
  }

  // Add status listener
  onStatusChange(callback) {
    this.listeners.push(callback)
  }

  // Notify listeners
  notify(status, message) {
    this.status = status
    this.listeners.forEach(cb => cb({ status, message }))
  }

  // Scan for Tesla vehicles
  scan(callback, duration = 15000) {
    this.notify('scanning', 'Scanning...')

    const devices = []

    teslaBleApi.scan((result) => {
      if (result.device) {
        devices.push(result.device)
        callback({ type: 'device', device: result.device })
      }

      if (result.type === 'complete') {
        this.notify('idle', `Found ${devices.length} devices`)
        callback({ type: 'complete', devices })
      }
    }, duration)
  }

  // Stop scanning
  stopScan() {
    teslaBleApi.stopScan()
    this.notify('idle', 'Scan stopped')
  }

  // Connect to saved vehicle or scan
  connect(callback) {
    this.notify('connecting', 'Connecting...')

    const savedMAC = teslaBleApi.savedMAC

    if (savedMAC) {
      // Try auto-connect first
      teslaBleApi.autoConnect((result) => {
        if (result.success) {
          this.notify('connected', 'Connected')
          callback({ success: true })
        } else {
          this.notify('error', result.error)
          callback({ success: false, error: result.error })
        }
      })
    } else {
      // Need to scan first
      this.notify('error', 'No saved vehicle')
      callback({ success: false, error: 'No saved vehicle. Scan first.' })
    }
  }

  // Connect to specific MAC
  connectToMAC(mac, callback) {
    this.notify('connecting', 'Connecting...')

    teslaBleApi.connect(mac, (result) => {
      if (result.success) {
        this.notify('connected', 'Connected')
        callback({ success: true })
      } else {
        this.notify('error', result.error)
        callback({ success: false, error: result.error })
      }
    }, this.storage)
  }

  // Disconnect
  disconnect() {
    teslaBleApi.disconnect()
    this.notify('disconnected', 'Disconnected')
  }

  // Check if connected
  isConnected() {
    return teslaBleApi.isConnected()
  }

  // Lock vehicle
  lock(callback) {
    if (!this.isConnected()) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    this.notify('busy', 'Locking...')

    teslaBleApi.lock((result) => {
      if (result.success) {
        this.notify('connected', 'Locked')
        callback({ success: true })
      } else {
        this.notify('error', result.error)
        callback({ success: false, error: result.error })
      }
    })
  }

  // Unlock vehicle
  unlock(callback) {
    if (!this.isConnected()) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    this.notify('busy', 'Unlocking...')

    teslaBleApi.unlock((result) => {
      if (result.success) {
        this.notify('connected', 'Unlocked')
        callback({ success: true })
      } else {
        this.notify('error', result.error)
        callback({ success: false, error: result.error })
      }
    })
  }

  // Open trunk
  openTrunk(callback) {
    if (!this.isConnected()) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    this.notify('busy', 'Opening trunk...')

    teslaBleApi.openTrunk((result) => {
      if (result.success) {
        this.notify('connected', 'Trunk opened')
        callback({ success: true })
      } else {
        this.notify('error', result.error)
        callback({ success: false, error: result.error })
      }
    })
  }

  // Open frunk
  openFrunk(callback) {
    if (!this.isConnected()) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    this.notify('busy', 'Opening frunk...')

    teslaBleApi.openFrunk((result) => {
      if (result.success) {
        this.notify('connected', 'Frunk opened')
        callback({ success: true })
      } else {
        this.notify('error', result.error)
        callback({ success: false, error: result.error })
      }
    })
  }

  // Pair key with vehicle
  pair(callback) {
    if (!this.isConnected()) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    this.notify('busy', 'Pairing...')

    teslaBleApi.pair((result) => {
      if (result.success) {
        this.notify('connected', 'Tap key card on car')
        callback({ success: true, message: result.message })
      } else {
        this.notify('error', result.error)
        callback({ success: false, error: result.error })
      }
    })
  }

  // Get full status
  getStatus() {
    return {
      ...teslaBleApi.getStatus(),
      serviceStatus: this.status
    }
  }

  // Clear saved data
  clear() {
    teslaBleApi.clear(this.storage)
    this.notify('disconnected', 'Cleared')
  }
}

// Singleton
const bleService = new BleService()

export default bleService
