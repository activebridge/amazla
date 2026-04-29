import store from './store.js'
import { binaryStringToBytes } from './tesla-ble/crypto/binary-utils.js'

class Phone {
  constructor(messageBuilder) {
    if (messageBuilder) {
      this._mb = messageBuilder
      return
    }
    const app = typeof getApp === 'function' ? getApp() : null
    this._mb = app && app._options && app._options.globalData ? app._options.globalData.messageBuilder : null
  }

  _request(method, params) {
    if (!this._mb) return Promise.reject(new Error('messageBuilder not available'))
    return this._mb.request({ method, params: params || {} }).then((r) => {
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

  // Sync/generate watch keypair and pre-build both BLE messages in one IPC call.
  // Writes store.watchPublicKey. cb: { success, pairMsg, verifyMsg }
  pairSetup(cb) {
    this._call('BLE_PAIR_SETUP', {}, cb, (r) => {
      store.watchPublicKey = r.watchPublicKey
      return { pairMsg: r.pairMsg, verifyMsg: r.verifyMsg }
    })
  }

  // Persist Tesla MAC to companion settingsStorage so the settings page can show paired state.
  saveVehicleMac(mac, cb) {
    this._call('SAVE_VEHICLE_MAC', { mac }, cb, () => {})
  }

  // Parse raw Tesla verify response, extract vehicle EC key, compute doublings table.
  // Writes store.vehicleEcPublicKey + store.vehicleDoublingsTable. cb: { success }
  completePairing(rawResponseBinary, cb) {
    this._call('BLE_COMPLETE_PAIRING', { rawResponse: rawResponseBinary }, cb, (r) => {
      if (!r.ecKey) throw new Error('No EC key in response')
      if (!r.table) throw new Error('No table in response')
      store.vehicleEcPublicKey = binaryStringToBytes(r.ecKey)
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
