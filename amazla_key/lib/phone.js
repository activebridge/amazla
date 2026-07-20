import store from './store.js'
import { bytesToBinaryString } from './tesla-ble/crypto/binary-utils.js'

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

  // Race an RPC against our own timer. The lib's 60s default timeout only arms
  // AFTER the shake handshake completes — a dead phone channel (side service not
  // running) hangs the promise forever and left the pairing spinner stuck with no
  // error. This guard turns that into a visible failure fast.
  _withTimeout(promise, method, ms) {
    let timer = null
    const clear = () => { if (timer !== null) { clearTimeout(timer); timer = null } }
    promise.then(clear, clear)
    const guard = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        timer = null
        reject(new Error(`${method}: phone not responding — open the Zepp app`))
      }, ms)
    })
    return Promise.race([promise, guard])
  }

  _request(method, params) {
    if (!this._mb) return Promise.reject(new Error('messageBuilder not available'))
    const rpc = this._mb.request({ method, params: params || {} }).then((r) => {
      if (!r || !r.success) throw new Error((r && r.error) || `${method} failed`)
      return r
    })
    return this._withTimeout(rpc, method, 10000)
  }

  // Binary response request. Server replies with a raw buffer envelope:
  //   [0x01][payload...] on success, [0x00][utf-8 error] on failure.
  // Used for large payloads (doublings table, key pool) where JSON's \uXXXX
  // escaping doubled the size and OOM-rebooted the watch on reassembly.
  _requestBin(method, params) {
    if (!this._mb) return Promise.reject(new Error('messageBuilder not available'))
    // 20s guard (not 10): the ECDH scalar-mul on the phone takes ~4s alone,
    // plus chunked binary transfer.
    const rpc = this._mb.request({ method, params: params || {} }, { dataType: 'bin' }).then((buf) => {
      if (!buf || buf.length < 1) throw new Error(`${method}: empty response`)
      const body = buf.subarray ? buf.subarray(1) : buf.slice(1)
      if (buf[0] !== 1) {
        let msg = ''
        for (let i = 0; i < body.length; i++) msg += String.fromCharCode(body[i])
        throw new Error(msg || `${method} failed`)
      }
      return body
    })
    return this._withTimeout(rpc, method, 20000)
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

  // Sync vehicle name, VIN, the auto-unlock/exit-on-lock prefs and the button-action
  // choice from companion settings. Writes store.vehicleName/vehicleVin/autoUnlock/
  // exitOnLock/buttonAction.
  syncSettings() {
    return this._call('GET_SETTINGS', {}, null, (r) => {
      store.vehicleName = r.vehicleName || null
      store.vehicleVin = r.vehicleVin || null
      store.autoUnlock = !!r.autoUnlock
      store.exitOnLock = !!r.exitOnLock
      store.buttonAction = r.buttonAction || 'lockUnlock'
    })
  }

  // Sync/generate watch key and pre-build both BLE messages in one IPC call.
  // Writes store.watchPublicKey only. cb: { success, pairMsg, verifyMsg }
  pairSetup(cb) {
    this._call('BLE_PAIR_SETUP', {}, cb, (r) => {
      console.log(`[Watch.diag] watchPublicKey len=${r.watchPublicKey == null ? 'null' : r.watchPublicKey.length}`)
      store.watchPublicKey = r.watchPublicKey
      return { pairMsg: r.pairMsg, verifyMsg: r.verifyMsg }
    })
  }

  // Mark paired in companion settingsStorage (vehiclePairedAt) so the settings page
  // shows paired state. No MAC — Tesla rotates it, so it's never worth syncing.
  savePaired(cb) {
    this._call('SAVE_PAIRED', {}, cb, () => {})
  }

  // Unpair: clear the tesla enrollment/vehicle data from the phone's settingsStorage.
  // The watch clears its own storage separately (tesla.reset()).
  reset(cb) {
    this._call('RESET', {}, cb, () => {})
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

  // Ask the phone to compute the ECDH shared secret (watchPriv × vehiclePub) for
  // a vehicle EC pubkey learned from a SessionInfo response. The phone holds the
  // watch private key, so it does the scalar-mul and returns just the 32-byte X —
  // the 16 KB doublings table never crosses BLE. Returns 32-byte Uint8Array.
  computeSharedSecret(vehiclePubBytes) {
    const binStr = bytesToBinaryString(vehiclePubBytes)
    return this._requestBin('BLE_COMPUTE_SHARED_SECRET', { vehiclePublicKeyBinary: binStr }).then((body) => toU8(body))
  }
}

export default Phone
