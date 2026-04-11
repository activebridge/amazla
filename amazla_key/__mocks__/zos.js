// Minimal stub for all @zos/* imports used by watch-side modules under test
export class LocalStorage {
  constructor() { this._data = {} }
  getItem(k) { return this._data[k] ?? null }
  setItem(k, v) { this._data[k] = v }
  removeItem(k) { delete this._data[k] }
}

// @zos/fs stub (not needed for current tests but avoids import errors)
export const writeFileSync = () => {}
export const readFileSync  = () => null

export default {}
