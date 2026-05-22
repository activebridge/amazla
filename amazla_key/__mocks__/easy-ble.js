// Functional mock for @silver-zepp/easy-ble.
//
// The real ble-master.js can't be Jest-loaded directly (ESM with private
// fields, jest doesn't transform node_modules in this project). This mock
// reproduces the API surface ble.js depends on and routes everything through
// @zos/ble (itself mocked → bleHarness), so production tests exercise the
// same harness paths as the ble-native suite.
import * as hmBle from '@zos/ble'

const SHORT_DELAY = 50

function ab2mac(ab) {
  const bytes = new Uint8Array(ab)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(':')
}

function mac2ab(mac) {
  return new Uint8Array(mac.split(':').map((b) => parseInt(b, 16))).buffer
}

function data2ab(data) {
  if (data instanceof ArrayBuffer) return data
  if (data instanceof Uint8Array) return data.buffer
  if (typeof data === 'string') {
    if (/^[0-9A-Fa-f]+$/.test(data)) {
      const bytes = []
      for (let i = 0; i < data.length; i += 2) bytes.push(parseInt(data.substring(i, i + 2), 16))
      return new Uint8Array(bytes).buffer
    }
    return new Uint8Array(data.split('').map((c) => c.charCodeAt(0))).buffer
  }
}

// Notification/value/desc-write handlers — module-scoped so easy-ble's late
// on.* registrations and off.* deregistrations behave like the real lib.
const _callbacks = {
  charaValueArrived: null,
  charaNotification: null,
  descWriteComplete: null,
  charaReadComplete: null,
  descReadComplete: null,
  charaWriteComplete: null,
  descValueArrived: null,
}

class On {
  charaValueArrived(cb) {
    _callbacks.charaValueArrived = cb
    hmBle.mstOnCharaValueArrived((resp) => {
      const { uuid, data, length } = resp || {}
      if (_callbacks.charaValueArrived) _callbacks.charaValueArrived(uuid, data, length)
    })
  }
  charaNotification(cb) {
    _callbacks.charaNotification = cb
    hmBle.mstOnCharaNotification((resp) => {
      const { uuid, data, length } = resp || {}
      if (_callbacks.charaNotification) _callbacks.charaNotification(uuid, data, length)
    })
  }
  descWriteComplete(cb) {
    _callbacks.descWriteComplete = cb
    hmBle.mstOnDescWriteComplete((resp) => {
      const { chara, desc, status } = resp || {}
      if (_callbacks.descWriteComplete) _callbacks.descWriteComplete(chara, desc, status)
    })
  }
  // Unused-but-referenced methods (kept for parity)
  charaReadComplete(cb) { _callbacks.charaReadComplete = cb }
  descReadComplete(cb) { _callbacks.descReadComplete = cb }
  charaWriteComplete(cb) { _callbacks.charaWriteComplete = cb }
  descValueArrived(cb) { _callbacks.descValueArrived = cb }
}

class Off {
  charaValueArrived() { _callbacks.charaValueArrived = null }
  charaNotification() { _callbacks.charaNotification = null }
  descWriteComplete() { _callbacks.descWriteComplete = null }
  charaReadComplete() { _callbacks.charaReadComplete = null }
  descReadComplete() { _callbacks.descReadComplete = null }
  charaWriteComplete() { _callbacks.charaWriteComplete = null }
  descValueArrived() { _callbacks.descValueArrived = null }
  deregisterAll() { Object.keys(_callbacks).forEach((k) => { _callbacks[k] = null }) }
}

export class BLEMaster {
  constructor() {
    this._lastConnectedMac = null
    this._connectId = null
    this._profilePid = null
    this._isConnected = false
    this._isScanning = false
    this.write = {
      // ble.js calls write.characteristic(uuid, data, true) for write-without-response
      characteristic: (uuid, data, writeWithoutResponse = false) => {
        const ab = data2ab(data)
        if (writeWithoutResponse) {
          hmBle.mstWriteCharacteristicWithoutResponse(this._profilePid, uuid, ab, ab.byteLength)
        } else {
          hmBle.mstWriteCharacteristic(this._profilePid, uuid, ab, ab.byteLength)
        }
      },
      descriptor: (chara, desc, data) => {
        const ab = data2ab(data)
        hmBle.mstWriteDescriptor(this._profilePid, chara, desc, ab, ab.byteLength)
      },
    }
    this.read = { characteristic() {}, descriptor() {} }
    this.on = new On()
    this.off = new Off()
    this.get = {
      isConnected: () => this._isConnected,
      connectionID: () => this._connectId,
      profilePID: () => this._profilePid,
    }
  }

  startScan(responseCallback, options = {}) {
    this._isScanning = true
    const { duration, on_duration } = options
    const modified = (scanResult) => {
      const macAddress = ab2mac(scanResult.dev_addr)
      responseCallback({ ...scanResult, dev_addr: macAddress })
    }
    hmBle.mstStartScan(modified, options)
    if (duration !== undefined) {
      setTimeout(() => { this.stopScan(); if (on_duration) on_duration() }, duration)
    }
    return true
  }

  stopScan() {
    if (this._isScanning) {
      this._isScanning = false
      return hmBle.mstStopScan()
    }
    return false
  }

  connect(devAddr, responseCallback) {
    if (this._isConnected) {
      responseCallback({ connected: true, status: 'connected' })
      return true
    }
    hmBle.mstConnect(mac2ab(devAddr), (result) => {
      if (result.connected === 0) {
        this._lastConnectedMac = devAddr
        this._connectId = result.connect_id
        this._isConnected = true
        responseCallback({ connected: true, status: 'connected' })
      } else {
        responseCallback({ connected: false, status: result.connected === 1 ? 'failed' : 'disconnected' })
      }
    })
    return true
  }

  startListener(_profileObject, responseCallback) {
    hmBle.mstOnPrepare((resp) => {
      const { profile, status } = resp || {}
      if (status === 0) {
        this._profilePid = profile
        responseCallback({ success: true, message: 'Success' })
      } else {
        responseCallback({ success: false, message: 'Profile prepare failed', code: 'BX_CORE_FAIL' })
      }
    })
    // Mirror easy-ble's SHORT_DELAY between mstOnPrepare registration and mstBuildProfile
    setTimeout(() => { hmBle.mstBuildProfile({}) }, SHORT_DELAY)
  }

  generateProfileObject(services /* , permissions */) {
    // Production code passes this object straight into startListener, which our
    // mock ignores. Return something non-null so ble.js stores it in this.profile.
    return { id: this._connectId, services }
  }

  disconnect() {
    if (!this._isConnected) return false
    hmBle.mstDisconnect(this._connectId)
    this._isConnected = false
    this._lastConnectedMac = null
    return true
  }

  quit() {
    if (!this._lastConnectedMac) return
    if (this._isConnected) {
      hmBle.mstOffAllCb()
      if (this._profilePid != null) hmBle.mstDestroyProfileInstance(this._profilePid)
      hmBle.mstDisconnect(this._connectId)
      this._isConnected = false
    }
    if (this.off && this.off.deregisterAll) this.off.deregisterAll()
    this._lastConnectedMac = null
    this._connectId = null
    this._profilePid = null
    if (this._isScanning) this.stopScan()
  }
}

export default {}
