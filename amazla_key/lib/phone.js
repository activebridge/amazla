import store from './store.js'
import { binaryStringToBytes } from './tesla-ble/crypto/binary-utils.js'

class Phone {
  constructor(page) {
    this._page = page
  }

  // Private: wraps page.request and rejects on !r.success
  _request(method, params) {
    return this._page.request({ method, params: params || {} }).then((r) => {
      if (!r || !r.success) throw new Error((r && r.error) || `${method} failed`)
      return r
    })
  }

  // Private: _request + success handler + error cb
  // fn(r) does side effects and returns optional extra fields for cb
  _call(method, params, cb, fn) {
    return this._request(method, params)
      .then((r) => {
        if (cb) cb({ success: true, ...fn(r) })
        else fn(r)
      })
      .catch((e) => {
        if (cb) cb({ success: false, error: e.message })
      })
  }

  // Sync ephemeral key pool from companion. Writes store.keyPool if pool returned.
  // Pass count=0 to force full regeneration (e.g. after pairing).
  syncPool(cb, count) {
    var currentCount = count !== undefined ? count : store.keyPoolCount
    this._call('BLE_SYNC_POOL', { currentCount }, cb, (r) => {
      if (r.pool) store.keyPool = binaryStringToBytes(r.pool)
    })
  }

  // Sync vehicle name and VIN from companion settings. Writes store.vehicleName/vehicleVin.
  syncSettings() {
    return this._call('GET_SETTINGS', {}, null, (r) => {
      store.vehicleName = r.vehicleName || null
      store.vehicleVin = r.vehicleVin || null
    })
  }

  // Generate or fetch enrolled watch keypair. Writes store.watchPublicKey.
  // cb: { success, publicKeyBinary }
  syncKeys(cb) {
    this._call('BLE_SYNC_KEYS', {}, cb, (r) => {
      store.watchPublicKey = r.publicKeyBinary
    })
  }

  // Build pairing (whitelist enrollment) message for the given watch public key.
  // cb: { success, message }
  pair(publicKeyBinary, cb) {
    this._call('BLE_PAIR', { publicKeyBinary }, cb, (r) => ({ message: r.message }))
  }

  // Build GetWhitelistEntryInfo message.
  // cb: { success, message }
  verifyPair(publicKeyBinary, cb) {
    this._call('BLE_VERIFY_PAIR', { publicKeyBinary }, cb, (r) => ({ message: r.message }))
  }

  // Precompute ECDH doublings table for a vehicle public key.
  // Writes store.vehicleDoublingsTable.
  // cb: { success }
  precomputeTable(vehiclePublicKeyBinary, cb) {
    this._call('BLE_PRECOMPUTE_TABLE', { vehiclePublicKeyBinary }, cb, (r) => {
      if (!r.table) throw new Error('No table')
      store.vehicleDoublingsTable = binaryStringToBytes(r.table)
    })
  }

  // Dev-mode: simulate full pairing flow without a real vehicle.
  // Writes all pairing artifacts to store.
  // cb: { success }
  simulatePair(cb) {
    var vehicleEcKeyBinary
    this._request('SIMULATE_PAIR')
      .then((r) => {
        store.watchPublicKey = r.watchPublicKeyBinary
        store.vehicleEcPublicKey = binaryStringToBytes(r.vehicleEcKeyBinary)
        store.vehicleMac = r.mac
        store.vehicleVin = r.vin
        vehicleEcKeyBinary = r.vehicleEcKeyBinary
        return this._request('BLE_PRECOMPUTE_TABLE', { vehiclePublicKeyBinary: vehicleEcKeyBinary })
      })
      .then((r) => {
        if (!r.table) throw new Error('Table failed')
        store.vehicleDoublingsTable = binaryStringToBytes(r.table)
        return this._request('BLE_SYNC_POOL', { currentCount: 0 })
      })
      .then((r) => {
        if (r.pool) store.keyPool = binaryStringToBytes(r.pool)
        cb({ success: true })
      })
      .catch((e) => {
        cb({ success: false, error: e.message || 'Error' })
      })
  }
}

export default Phone
