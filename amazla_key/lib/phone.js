import store from './store.js'
import { binaryStringToBytes } from './tesla-ble/crypto/binary-utils.js'

// Copy a buffer view into a fresh Uint8Array so the large underlying BLE
// message buffer can be GC'd once the bytes we need are extracted.
function toU8(view) {
  const u = new Uint8Array(view.length)
  u.set(view)
  return u
}

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

  // Binary response request. Server replies with a raw buffer envelope:
  //   [0x01][payload...] on success, [0x00][utf-8 error] on failure.
  // Used for large payloads (doublings table, key pool) where JSON's \uXXXX
  // escaping doubled the size and OOM-rebooted the watch on reassembly.
  _requestBin(method, params) {
    if (!this._mb) return Promise.reject(new Error('messageBuilder not available'))
    return this._mb.request({ method, params: params || {} }, { dataType: 'bin' }).then((buf) => {
      if (!buf || buf.length < 1) throw new Error(`${method}: empty response`)
      const body = buf.subarray ? buf.subarray(1) : buf.slice(1)
      if (buf[0] !== 1) {
        let msg = ''
        for (let i = 0; i < body.length; i++) msg += String.fromCharCode(body[i])
        throw new Error(msg || `${method} failed`)
      }
      return body
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
    this._requestBin('BLE_SYNC_POOL', { currentCount })
      .then((body) => {
        if (body.length > 0) store.keyPool = toU8(body)
        if (cb) cb({ success: true })
      })
      .catch((e) => {
        if (cb) cb({ success: false, error: e.message })
      })
  }

  // Sync vehicle name and VIN from companion settings. Writes store.vehicleName/vehicleVin.
  syncSettings() {
    return this._call('GET_SETTINGS', {}, null, (r) => {
      store.vehicleName = r.vehicleName || null
      store.vehicleVin = r.vehicleVin || null
    })
  }

  // Generate or fetch enrolled watch keypair. Writes store.watchPublicKey + watchPrivateKey.
  // Tesla protocol uses the same long-term keypair for SessionInfoRequest identity AND ECDH,
  // so the watch must hold both halves locally (mirrors vehicle-command Go SDK).
  // cb: { success, publicKeyBinary, privateKeyBinary }
  syncKeys(cb) {
    this._call('BLE_SYNC_KEYS', {}, cb, (r) => {
      store.watchPublicKey = r.publicKeyBinary
      if (r.privateKeyBinary) store.watchPrivateKey = r.privateKeyBinary
    })
  }

  // Sync/generate watch keypair and pre-build both BLE messages in one IPC call.
  // Writes store.watchPublicKey + watchPrivateKey. cb: { success, pairMsg, verifyMsg }
  pairSetup(cb) {
    this._call('BLE_PAIR_SETUP', {}, cb, (r) => {
      store.watchPublicKey = r.watchPublicKey
      if (r.watchPrivateKey) store.watchPrivateKey = r.watchPrivateKey
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
    this._requestBin('BLE_COMPLETE_PAIRING', { rawResponse: rawResponseBinary })
      .then((body) => {
        // [65-byte ecKey][16384-byte table]
        if (body.length < 66) throw new Error('Malformed pairing response')
        store.vehicleEcPublicKey = toU8(body.subarray(0, 65))
        store.vehicleDoublingsTable = toU8(body.subarray(65))
        if (cb) cb({ success: true })
      })
      .catch((e) => {
        if (cb) cb({ success: false, error: e.message })
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
        if (r.watchPrivateKeyBinary) store.watchPrivateKey = r.watchPrivateKeyBinary
        store.vehicleEcPublicKey = binaryStringToBytes(r.vehicleEcKeyBinary)
        store.vehicleMac = r.mac
        store.vehicleVin = r.vin
        vehicleEcKeyBinary = r.vehicleEcKeyBinary
        return this._requestBin('BLE_PRECOMPUTE_TABLE', { vehiclePublicKeyBinary: vehicleEcKeyBinary })
      })
      .then((tableBody) => {
        store.vehicleDoublingsTable = toU8(tableBody)
        return this._requestBin('BLE_SYNC_POOL', { currentCount: 0 })
      })
      .then((poolBody) => {
        if (poolBody.length > 0) store.keyPool = toU8(poolBody)
        cb({ success: true })
      })
      .catch((e) => {
        cb({ success: false, error: e.message || 'Error' })
      })
  }
}

export default Phone
