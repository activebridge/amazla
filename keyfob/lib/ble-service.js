// BLE Service for Tesla control
// Wraps tesla-ble library for use in watch pages
// Pairing uses phone app-side for crypto

import teslaBleApi, { teslaBLE } from './tesla-ble/index.js'
import { TESLA_PRIVATE_KEY, TESLA_PUBLIC_KEY } from '../../secrets.js'
import { writeFileSync, readFileSync } from '@zos/fs'

const SESSION_KEYS_FILE = 'session_keys.txt'
const BLE_SETTINGS_FILE = 'ble_settings.txt'

// File-based storage (LocalStorage doesn't exist on ZeppOS)
class FileStorage {
  constructor() {
    this.data = {}
    this.load()
  }

  load() {
    try {
      const json = readFileSync({ path: BLE_SETTINGS_FILE, options: { encoding: 'utf8' } })
      this.data = json ? JSON.parse(json) : {}
    } catch (e) {
      this.data = {}
    }
  }

  save() {
    try {
      writeFileSync({ path: BLE_SETTINGS_FILE, data: JSON.stringify(this.data), options: { encoding: 'utf8' } })
    } catch (e) {
      console.log('FileStorage save error:', e)
    }
  }

  getItem(key) {
    return this.data[key] || null
  }

  setItem(key, value) {
    this.data[key] = value
    this.save()
  }

  removeItem(key) {
    delete this.data[key]
    this.save()
  }
}

class BleService {
  constructor() {
    this.status = 'disconnected'
    this.listeners = []
    this.storage = null
    this.initialized = false
    this.requestFunc = null // Function to call app-side
    this.sessionKeyPool = [] // Pre-generated session keys for standalone operation
  }

  // Initialize the BLE service
  init() {
    if (this.initialized) {
      return {
        success: true,
        hasKeys: !!(TESLA_PRIVATE_KEY && TESLA_PUBLIC_KEY),
        sessionKeyCount: this.sessionKeyPool.length
      }
    }

    try {
      this.storage = new FileStorage()
      teslaBleApi.init(this.storage)

      const hasKeys = !!(TESLA_PRIVATE_KEY && TESLA_PUBLIC_KEY)
      if (hasKeys) {
        teslaBleApi.setPrivateKey(TESLA_PRIVATE_KEY, TESLA_PUBLIC_KEY)
      }

      // Load session key pool from file
      this.loadSessionKeys()

      this.initialized = true
      return {
        success: true,
        hasKeys,
        sessionKeyCount: this.sessionKeyPool.length
      }
    } catch (e) {
      console.log('BLE Service init error:', e)
      return { success: false, error: e.message }
    }
  }

  // Load session keys from file
  loadSessionKeys() {
    try {
      const poolJson = readFileSync({ path: SESSION_KEYS_FILE, options: { encoding: 'utf8' } })
      this.sessionKeyPool = poolJson ? JSON.parse(poolJson) : []
      console.log(`Loaded ${this.sessionKeyPool.length} session keys`)
    } catch (e) {
      console.log('Failed to load session keys:', e)
      this.sessionKeyPool = []
    }
  }

  // Save session keys to file
  saveSessionKeys() {
    try {
      writeFileSync({ path: SESSION_KEYS_FILE, data: JSON.stringify(this.sessionKeyPool), options: { encoding: 'utf8' } })
    } catch (e) {
      console.log('Failed to save session keys:', e)
    }
  }

  // Get session key pool count
  getSessionKeyCount() {
    return this.sessionKeyPool.length
  }

  // Refill session key pool from phone (silent, background)
  // Pass requestFunc directly to avoid closure issues in ZeppOS
  async refillSessionKeys(count = 5, requestFunc = null) {
    console.log('[BLE Service] Requesting session keys from phone...')
    try {
      const result = await this.callAppSide('BLE_GENERATE_SESSION_KEYS', { count }, requestFunc)
      console.log('[BLE Service] Got result:', JSON.stringify(result).slice(0, 100))
      if (result.success && result.keys) {
        this.sessionKeyPool.push(...result.keys)
        this.saveSessionKeys()
        console.log(`[BLE Service] Refilled pool, now ${this.sessionKeyPool.length} keys`)
      }
      return result
    } catch (e) {
      // Phone not connected - silent fail, use remaining keys
      console.log('[BLE Service] Session key refill failed:', e.message || e)
      return { success: false, error: e.message || 'Phone not connected' }
    }
  }

  // Get next session key (auto-refills if pool is low)
  async getSessionKey() {
    const THRESHOLD = 5

    // Try to refill if pool is low (silent, background)
    if (this.sessionKeyPool.length < THRESHOLD) {
      await this.refillSessionKeys()
    }

    // Pop and return next key
    if (this.sessionKeyPool.length > 0) {
      const key = this.sessionKeyPool.shift()
      this.saveSessionKeys()
      return key
    }

    return null // No keys available
  }

  // Check if we have session keys
  hasSessionKeys() {
    return this.sessionKeyPool.length > 0
  }

  // Set the request function for calling app-side
  setRequestFunc(requestFunc) {
    this.requestFunc = requestFunc
  }

  // Call app-side for crypto operations
  // Pass requestFunc directly to avoid closure issues
  callAppSide(method, params = {}, requestFunc = null) {
    const reqFn = requestFunc || this.requestFunc
    return new Promise((resolve, reject) => {
      if (!reqFn) {
        reject(new Error('App-side not connected'))
        return
      }

      // Only include params if not empty
      const req = Object.keys(params).length > 0 ? { method, params } : { method }
      reqFn(req)
        .then(result => resolve(result))
        .catch(err => reject(err))
    })
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

  // Helper: convert hex to bytes
  hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
    }
    return bytes
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

  stopScan() {
    teslaBleApi.stopScan()
    this.notify('idle', 'Scan stopped')
  }

  connect(callback) {
    this.notify('connecting', 'Connecting...')
    const savedMAC = teslaBleApi.savedMAC

    if (savedMAC) {
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
      this.notify('error', 'No saved vehicle')
      callback({ success: false, error: 'No saved vehicle. Scan first.' })
    }
  }

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

  disconnect() {
    teslaBleApi.disconnect()
    this.notify('disconnected', 'Disconnected')
  }

  isConnected() {
    return teslaBleApi.isConnected()
  }

  // Pair key with vehicle - uses app-side crypto
  pair(callback) {
    if (!this.isConnected()) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    if (!TESLA_PUBLIC_KEY) {
      callback({ success: false, error: 'No public key' })
      return
    }

    this.notify('busy', 'Pairing...')

    // Get pair message from app-side (phone does the crypto)
    this.callAppSide('BLE_PAIR', { publicKeyHex: TESLA_PUBLIC_KEY })
      .then(result => {
        if (!result.success) {
          this.notify('error', result.error)
          callback({ success: false, error: result.error })
          return
        }

        // Send message via BLE to Tesla
        const messageBytes = this.hexToBytes(result.messageHex)
        teslaBLE.send(messageBytes, (bleResult) => {
          if (bleResult.success) {
            this.notify('connected', 'Tap key card on car')
            callback({ success: true, message: 'Tap key card on car' })
          } else {
            this.notify('error', bleResult.error)
            callback({ success: false, error: bleResult.error })
          }
        })
      })
      .catch(err => {
        this.notify('error', err.message)
        callback({ success: false, error: err.message })
      })
  }

  // Commands not yet implemented - need session establishment
  lock(callback) {
    callback({ success: false, error: 'Not implemented yet' })
  }

  unlock(callback) {
    callback({ success: false, error: 'Not implemented yet' })
  }

  openTrunk(callback) {
    callback({ success: false, error: 'Not implemented yet' })
  }

  openFrunk(callback) {
    callback({ success: false, error: 'Not implemented yet' })
  }

  getStatus() {
    return {
      ...teslaBleApi.getStatus(),
      serviceStatus: this.status,
      sessionKeyCount: this.sessionKeyPool.length
    }
  }

  clear() {
    teslaBleApi.clear(this.storage)
    this.sessionKeyPool = []
    this.saveSessionKeys()
    this.notify('disconnected', 'Cleared')
  }
}

const bleService = new BleService()
export default bleService
