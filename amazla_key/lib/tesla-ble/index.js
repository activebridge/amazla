import store from '../store.js'
import teslaBLE from './ble-native.js'

const BLE = {
  get isConnected() {
    return teslaBLE.isConnected()
  },
  set onDisconnect(fn) {
    teslaBLE.onDisconnect = fn
  },
  scan(callback, duration = 10000) {
    return teslaBLE.scan(callback, duration)
  },
  stopScan() {
    return teslaBLE.stopScan()
  },
  connect(mac, callback) {
    teslaBLE.connect(mac, (result) => {
      if (result.success) store.vehicleMac = mac
      callback(result)
    })
  },
  sendAndWaitForResponse(data, callback, timeout) {
    return teslaBLE.sendAndWaitForResponse(data, callback, timeout)
  },
  waitForNextResponse(timeout, callback) {
    return teslaBLE.waitForNextResponse(timeout, callback)
  },
  disconnect() {
    teslaBLE.disconnect()
  },
  clear() {
    teslaBLE.disconnect()
    store.reset()
  },
  reset() {
    teslaBLE.reset()
  },
}

export default BLE
export { teslaBLE }
