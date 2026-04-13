import { readFileSync, rmSync, writeFileSync } from '@zos/fs'
import { LocalStorage } from '@zos/storage'

const localStorage = new LocalStorage()

let _doublingsTableCache = null

const readBinary = (path) => {
  try {
    const raw = readFileSync({ path: `${path}.dat` })
    if (raw) return new Uint8Array(raw)
    return undefined
  } catch (_e) {
    return undefined
  }
}

const writeBinary = (path, bytes) => {
  bytes &&
    writeFileSync({
      path: `${path}.dat`,
      data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    })
}

export default {
  get watchPublicKey() {
    return readBinary('watch_public_key')
  },
  set watchPublicKey(value) {
    writeBinary('watch_public_key', value)
  },
  get vehicleEcPublicKey() {
    return readBinary('vehicle_ec_public_key')
  },
  set vehicleEcPublicKey(value) {
    writeBinary('vehicle_ec_public_key', value)
  },
  get vehicleDoublingsTable() {
    if (_doublingsTableCache) return _doublingsTableCache
    const data = readBinary('vehicle_doublings_table')
    if (!data || data.length !== 16384) return undefined
    _doublingsTableCache = new Uint32Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
    return _doublingsTableCache
  },
  set vehicleDoublingsTable(value) {
    _doublingsTableCache = null
    writeBinary('vehicle_doublings_table', value)
  },
  get keyPool() {
    return readBinary('key_pool')
  },
  set keyPool(value) {
    writeBinary('key_pool', value)
  },
  get vehicleMac() {
    return localStorage.getItem('vehicleMac')
  },
  set vehicleMac(value) {
    localStorage.setItem('vehicleMac', value)
  },
  get vehicleVin() {
    return localStorage.getItem('vehicleVin')
  },
  set vehicleVin(value) {
    localStorage.setItem('vehicleVin', value)
  },
  get vehicleName() {
    return localStorage.getItem('vehicleName')
  },
  set vehicleName(value) {
    localStorage.setItem('vehicleName', value)
  },
  get vehicleModel() {
    return localStorage.getItem('vehicleModel')
  },
  set vehicleModel(value) {
    localStorage.setItem('vehicleModel', value)
  },

  removeBinary: (key) => {
    try {
      rmSync({ path: `${key}.dat` })
    } catch (_e) {
      // ignore
    }
  },
  removeItem: (key) => localStorage.removeItem(key),
}
