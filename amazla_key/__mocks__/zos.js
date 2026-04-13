// Minimal stub for all @zos/* imports used by watch-side modules under test
export class LocalStorage {
  constructor() { this._data = {} }
  getItem(k) { return this._data[k] ?? null }
  setItem(k, v) { this._data[k] = v }
  removeItem(k) { delete this._data[k] }
}

// @zos/fs stub
export const writeFileSync = () => {}
export const readFileSync  = () => null

// @zos/ble native stubs
export const mstStartScan              = () => true
export const mstStopScan               = () => true
export const mstConnect                = () => true
export const mstDisconnect             = () => {}
export const mstBuildProfile           = () => 1
export const mstDestroyProfileInstance = () => {}
export const mstWriteCharacteristic    = () => {}
export const mstWriteDescriptor        = () => {}
export const mstSetMTU                 = () => {}
export const mstOnPrepare              = () => {}
export const mstOnCharaValueArrived    = () => {}
export const mstOnCharaNotification    = () => {}
export const mstOnDescWriteComplete    = () => {}

export default {}
