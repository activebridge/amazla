// BLE Service for Tesla control (The "Radio")
// Relay model: Watch handles BLE transport, Phone handles Protobuf/Crypto

import teslaBLE from './tesla-ble/ble.js'
import { TESLA_PRIVATE_KEY, TESLA_PUBLIC_KEY } from '../../secrets.js'
import { writeFileSync, readFileSync } from '@zos/fs'

const SESSION_KEYS_FILE = 'session_keys.txt'
const BLE_SETTINGS_FILE = 'ble_settings.txt'

class FileStorage {
  constructor() { this.data = {}; this.load() }
  load() {
    try {
      const json = readFileSync({ path: BLE_SETTINGS_FILE, options: { encoding: 'utf8' } })
      this.data = json ? JSON.parse(json) : {}
    } catch (e) { this.data = {} }
  }
  save() {
    try { writeFileSync({ path: BLE_SETTINGS_FILE, data: JSON.stringify(this.data), options: { encoding: 'utf8' } }) }
    catch (e) { console.log('FileStorage save error:', e) }
  }
  getItem(key) { return this.data[key] || null }
  setItem(key, value) { this.data[key] = value; this.save() }
}

class BleService {
  constructor() {
    this.status = 'disconnected'
    this.listeners = []
    this.storage = null
    this.initialized = false
    this.requestFunc = null
    this.debugCallback = null
  }

  setDebugCallback(callback) { this.debugCallback = callback }
  debug(message) {
    console.log('[BLE Radio]', message)
    if (this.debugCallback) this.debugCallback(message)
  }

  init() {
    if (this.initialized) return { success: true }
    try {
      this.storage = new FileStorage()
      this.initialized = true
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  setRequestFunc(requestFunc) { this.requestFunc = requestFunc }

  callAppBrain(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.requestFunc) return reject(new Error('Phone brain not connected'))
      this.requestFunc({ method, params }).then(resolve).catch(reject)
    })
  }

  onStatusChange(callback) { this.listeners.push(callback) }
  notify(status, message) {
    this.status = status
    this.listeners.forEach(cb => cb({ status, message }))
  }

  bytesToHex(bytes) { return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('') }
  hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) bytes[i/2] = parseInt(hex.substr(i, 2), 16)
    return bytes
  }

  scan(callback) {
    this.notify('scanning', 'Scanning...')
    teslaBLE.scan((result) => {
      if (result.type === 'found') callback({ type: 'device', device: result.device })
      if (result.type === 'complete') {
        this.notify('idle', 'Scan complete')
        callback({ type: 'complete', devices: result.devices })
      }
    })
  }

  connect(mac, callback) {
    this.notify('connecting', 'Connecting...')
    teslaBLE.connect(mac, (result) => {
      if (result.success) {
        this.notify('connected', 'Connected')
        callback({ success: true })
      } else {
        this.notify('error', result.error)
        callback({ success: false, error: result.error })
      }
    })
  }

  disconnect() {
    teslaBLE.disconnect()
    this.notify('disconnected', 'Disconnected')
  }

  pair(callback) {
    this.debug('Pairing started...')
    if (!teslaBLE.isConnected()) return callback({ success: false, error: 'Not connected' })

    this.notify('busy', 'Building pair msg...')
    
    // 1. Get pairing bytes from Phone Brain
    this.callAppBrain('BLE_PAIR', { publicKeyHex: TESLA_PUBLIC_KEY })
      .then(res => {
        if (!res.success) throw new Error(res.error)
        
        // 2. Send to Tesla via Watch Radio
        this.debug('Sending pair request...')
        teslaBLE.sendAndWaitForResponse(this.hexToBytes(res.messageHex), (bleRes) => {
          if (!bleRes.success) return callback({ success: false, error: bleRes.error })

          // 3. Send response back to Phone Brain for parsing
          this.callAppBrain('BLE_PARSE_PAIRING', { responseHex: this.bytesToHex(bleRes.data) })
            .then(parsed => {
              this.debug('Parsed: ' + parsed.status)
              if (parsed.status === 'wait') {
                this.notify('busy', 'Tap key card on car')
                callback({ success: true, status: 'waiting', message: 'Tap key card' })
                
                // Wait for the final OK after tap
                teslaBLE.waitForNextResponse(60000, (finalBleRes) => {
                  if (!finalBleRes.success) return callback({ success: false, error: finalBleRes.error })
                  this.callAppBrain('BLE_PARSE_PAIRING', { responseHex: this.bytesToHex(finalBleRes.data) })
                    .then(finalParsed => {
                      if (finalParsed.status === 'ok') {
                        this.notify('connected', 'Key added!')
                        callback({ success: true, status: 'complete' })
                      } else {
                        callback({ success: false, error: finalParsed.error || 'Failed' })
                      }
                    })
                })
              } else if (parsed.status === 'ok') {
                callback({ success: true, status: 'complete' })
              } else {
                callback({ success: false, error: parsed.error })
              }
            })
        })
      })
      .catch(err => callback({ success: false, error: err.message }))
  }

  isConnected() { return teslaBLE.isConnected() }
}

const bleService = new BleService()
export default bleService
