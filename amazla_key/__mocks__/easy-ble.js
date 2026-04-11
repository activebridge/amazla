// Minimal stub for @silver-zepp/easy-ble
export class BLEMaster {
  startScan() {}
  stopScan() {}
  connect() {}
  disconnect() {}
  startListener() {}
  write = { characteristic() {}, descriptor() {}, enableCharaNotifications() {} }
  read  = { characteristic() {}, descriptor() {} }
  on    = {}
  off   = {}
  get get() { return { isConnected: () => false } }
}
export default {}
