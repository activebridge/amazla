// BLE Service for Tesla control
// Wraps tesla-ble library for use in watch pages
// All crypto runs on watch - no phone needed

import teslaBleApi, { teslaBLE } from './tesla-ble/index.js'
import teslaSession from './tesla-ble/session.js'
import { parsePairingResponse } from './tesla-ble/protocol/vcsec.js'
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
    this.debugCallback = null // Callback for showing debug toasts
  }

  // Set debug callback for showing toast messages
  setDebugCallback(callback) {
    this.debugCallback = callback
  }

  // Show debug toast (if callback set)
  debug(message) {
    console.log('[BLE Debug]', message)
    if (this.debugCallback) {
      this.debugCallback(message)
    }
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

  // Helper: convert bytes to hex
  bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
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
  // Flow: Send pairing request -> Wait for WAIT status -> User taps keycard -> Wait for OK status
  pair(callback) {
    this.debug('pair() called')

    if (!this.isConnected()) {
      this.debug('Not connected!')
      callback({ success: false, error: 'Not connected' })
      return
    }

    if (!TESLA_PUBLIC_KEY) {
      this.debug('No public key!')
      callback({ success: false, error: 'No public key' })
      return
    }

    this.notify('busy', 'Pairing...')
    this.debug('Building pair msg...')

    // Get pair message from app-side (phone does the crypto)
    this.callAppSide('BLE_PAIR', { publicKeyHex: TESLA_PUBLIC_KEY })
      .then(result => {
        this.debug(`Msg built: ${result.success}`)
        if (!result.success) {
          this.debug(`Error: ${result.error}`)
          this.notify('error', result.error)
          callback({ success: false, error: result.error })
          return
        }

        // Send message via BLE and wait for Tesla's response
        const messageBytes = this.hexToBytes(result.messageHex)
        this.debug(`Sending ${messageBytes.length}B...`)

        teslaBLE.sendAndWaitForResponse(messageBytes, (bleResult) => {
          this.debug(`Response: ${bleResult.success}`)

          if (!bleResult.success) {
            this.debug(`BLE err: ${bleResult.error}`)
            this.notify('error', bleResult.error)
            callback({ success: false, error: bleResult.error })
            return
          }

          // Log raw response bytes for debugging
          if (bleResult.data) {
            const hex = this.bytesToHex(bleResult.data).slice(0, 40)
            this.debug(`Data: ${hex}...`)
          }

          // Parse the response
          const parsed = parsePairingResponse(bleResult.data)
          this.debug(`Status: ${parsed.status || 'unknown'}`)

          if (parsed.status === 'wait') {
            // Tesla is waiting for keycard - notify user and wait for second response
            this.notify('busy', 'Tap key card on car')
            this.debug('Waiting for keycard...')
            callback({ success: true, status: 'waiting', message: 'Tap key card on car' })

            // Wait for the confirmation response after keycard tap (60 second timeout)
            this._waitForPairingConfirmation(callback)
          } else if (parsed.status === 'ok') {
            // Key added successfully (unlikely on first response)
            this.notify('connected', 'Key added!')
            this.debug('Key added OK!')
            callback({ success: true, status: 'complete', message: 'Key added successfully' })
          } else {
            // Error or unknown status
            this.debug(`Err: ${parsed.error || 'unknown'}`)
            this.notify('error', parsed.error || 'Pairing failed')
            callback({ success: false, error: parsed.error || 'Pairing failed' })
          }
        }, 15000) // 15 second timeout for first response
      })
      .catch(err => {
        this.debug(`Exception: ${err.message}`)
        this.notify('error', err.message)
        callback({ success: false, error: err.message })
      })
  }

  // Wait for pairing confirmation after keycard tap
  _waitForPairingConfirmation(callback) {
    this.debug('Waiting for tap...')

    // Set up a 60 second timeout for keycard tap
    const timeout = setTimeout(() => {
      this.debug('Tap timeout!')
      teslaBLE.responseCallback = null
      this.notify('error', 'Keycard tap timeout')
      callback({ success: false, error: 'Keycard tap timeout - try again' })
    }, 60000)

    // Wait for the response that comes after keycard tap
    teslaBLE.responseCallback = (result) => {
      clearTimeout(timeout)
      this.debug(`Tap response: ${result.success}`)

      if (!result.success) {
        this.debug(`Tap err: ${result.error}`)
        this.notify('error', result.error)
        callback({ success: false, error: result.error })
        return
      }

      // Log raw response for debugging
      if (result.data) {
        const hex = this.bytesToHex(result.data).slice(0, 40)
        this.debug(`Tap data: ${hex}...`)
      }

      const parsed = parsePairingResponse(result.data)
      this.debug(`Tap status: ${parsed.status || 'unknown'}`)

      if (parsed.status === 'ok') {
        this.notify('connected', 'Key added!')
        this.debug('SUCCESS! Key added!')
        callback({ success: true, status: 'complete', message: 'Key added successfully' })
      } else if (parsed.status === 'error') {
        this.debug(`Tap error: ${parsed.error}`)
        this.notify('error', parsed.error)
        callback({ success: false, error: parsed.error })
      } else {
        this.debug('Unexpected response')
        this.notify('error', 'Unexpected response')
        callback({ success: false, error: 'Unexpected response from car' })
      }
    }
  }

  // Establish session with Tesla (ECDH handshake)
  establishSession(callback) {
    this.debug('Establishing session...')

    if (!this.isConnected()) {
      this.debug('Not connected!')
      callback({ success: false, error: 'Not connected' })
      return
    }

    // Load keypair from session key pool if available
    if (this.sessionKeyPool.length > 0) {
      const keypair = this.sessionKeyPool.shift()
      this.saveSessionKeys() // Save updated pool
      teslaSession.setPregenKeypair(keypair.privateKeyHex, keypair.publicKeyHex)
      this.debug(`Using pooled key (${this.sessionKeyPool.length} left)`)
    }

    // Set the enrolled key for pairing operations
    if (TESLA_PRIVATE_KEY && TESLA_PUBLIC_KEY) {
      teslaSession.setPrivateKey(TESLA_PRIVATE_KEY, TESLA_PUBLIC_KEY)
    }

    this.notify('busy', 'Session...')

    teslaSession.requestSessionInfo((result) => {
      this.debug(`Session: ${result.success ? 'OK' : result.error}`)

      if (result.success) {
        this.notify('connected', 'Session OK')
        callback({ success: true, counter: result.counter })
      } else {
        this.notify('error', result.error)
        callback({ success: false, error: result.error })
      }
    })
  }

  // Check if session is established
  isSessionEstablished() {
    return teslaSession.isEstablished()
  }

  // Lock vehicle
  lock(callback) {
    this.debug('Lock...')

    if (!this.isConnected()) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    this.notify('busy', 'Locking...')

    teslaSession.lock((result) => {
      this.debug(`Lock: ${result.success ? 'OK' : result.error}`)

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
    this.debug('Unlock...')

    if (!this.isConnected()) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    this.notify('busy', 'Unlocking...')

    teslaSession.unlock((result) => {
      this.debug(`Unlock: ${result.success ? 'OK' : result.error}`)

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
    this.debug('Trunk...')

    if (!this.isConnected()) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    this.notify('busy', 'Opening trunk...')

    teslaSession.openTrunk((result) => {
      this.debug(`Trunk: ${result.success ? 'OK' : result.error}`)

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
    this.debug('Frunk...')

    if (!this.isConnected()) {
      callback({ success: false, error: 'Not connected' })
      return
    }

    this.notify('busy', 'Opening frunk...')

    teslaSession.openFrunk((result) => {
      this.debug(`Frunk: ${result.success ? 'OK' : result.error}`)

      if (result.success) {
        this.notify('connected', 'Frunk opened')
        callback({ success: true })
      } else {
        this.notify('error', result.error)
        callback({ success: false, error: result.error })
      }
    })
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
