import store from './store.js'
import { binaryStringToBytes, bytesToBinaryString } from './tesla-ble/crypto/binary-utils.js'

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
      const _hex = (s) => { if (s == null) return '<null>'; let h=''; for (let i=0;i<s.length;i++) h += (s.charCodeAt(i)&0xff).toString(16).padStart(2,'0'); return h }
      console.log(`[Watch.diag] r.watchPublicKey:  len=${r.watchPublicKey == null ? 'null' : r.watchPublicKey.length} hex=${_hex(r.watchPublicKey)}`)
      console.log(`[Watch.diag] r.watchPrivateKey: len=${r.watchPrivateKey == null ? 'null' : r.watchPrivateKey.length} hex=${_hex(r.watchPrivateKey)}`)
      store.watchPublicKey = r.watchPublicKey
      if (r.watchPrivateKey) store.watchPrivateKey = r.watchPrivateKey
      return { pairMsg: r.pairMsg, verifyMsg: r.verifyMsg }
    })
  }

  // Diagnostic: phone reads its stored priv/pub, derives pub from priv, returns
  // all three as hex. Watch caller compares to local store + logs everything.
  // No vehicle needed; tells us if phone↔watch keys agree AND if priv·G == pub.
  verifyKeypair(cb) {
    return this._call('VERIFY_KEYPAIR', {}, cb, (r) => r)
  }

  // Persist Tesla MAC to companion settingsStorage so the settings page can show paired state.
  saveVehicleMac(mac, cb) {
    this._call('SAVE_VEHICLE_MAC', { mac }, cb, () => {})
  }

  // No-op: pair just enrolls the watch key with the vehicle. The vehicle's
  // actual session EC pubkey is NOT in the pair response (field 17 holds a
  // signer/admin key from WhitelistInfo, not the runtime key). We get the
  // real vehicle pubkey from SessionInfo on first connect and build the
  // doublings table then — matches Tesla Go SDK. Kept as a hook so the
  // pairing flow can still log completion.
  completePairing(_rawResponseBinary, cb) {
    if (cb) cb({ success: true })
  }

  // Build the ECDH doublings table on phone for a vehicle EC pubkey learned
  // from a SessionInfo response. Returns 16384-byte Uint8Array.
  precomputeTable(vehiclePubBytes) {
    const binStr = bytesToBinaryString(vehiclePubBytes)
    return this._requestBin('BLE_PRECOMPUTE_TABLE', { vehiclePublicKeyBinary: binStr })
      .then((body) => toU8(body))
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
        cb({ success: true })
      })
      .catch((e) => {
        cb({ success: false, error: e.message || 'Error' })
      })
  }
}

export default Phone
